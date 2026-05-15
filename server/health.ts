import { prisma } from "@/server/lib/prisma";

const CHECK_TIMEOUT_MS = 8_000;

type ComponentStatus =
    | "operational"
    | "degraded_performance"
    | "partial_outage"
    | "major_outage";

type Indicator = "none" | "minor" | "major" | "critical";

interface ComponentResult {
    id: string;
    name: string;
    status: ComponentStatus;
    group: false;
    description: string;
}

async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), ms),
        ),
    ]);
}

async function checkDatabase(): Promise<ComponentResult> {
    try {
        await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS);
        return { id: "database", name: "Database", status: "operational", group: false, description: "" };
    } catch {
        return { id: "database", name: "Database", status: "major_outage", group: false, description: "Connection failed" };
    }
}

async function checkBambBuddy(): Promise<ComponentResult> {
    const endpoint = process.env.BAMBUDDY_ENDPOINT?.replace(/\/$/, "");
    const apiKey = process.env.BAMBUDDY_API_KEY;

    if (!endpoint || !apiKey) {
        return { id: "bambuddy", name: "BambuBuddy", status: "degraded_performance", group: false, description: "Not configured" };
    }

    try {
        const res = await withTimeout(
            fetch(`${endpoint}/api/v1/printers`, {
                headers: { "X-API-Key": apiKey },
                signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            }),
            CHECK_TIMEOUT_MS,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { id: "bambuddy", name: "BambBuddy", status: "operational", group: false, description: "" };
    } catch {
        return { id: "bambuddy", name: "BambBuddy", status: "major_outage", group: false, description: "Unreachable" };
    }
}

async function checkStudentApi(): Promise<ComponentResult> {
    const base = process.env.STUDENT_API_BASE;
    const key = process.env.STUDENT_API_KEY;

    if (!base) {
        return { id: "student-api", name: "Student API", status: "degraded_performance", group: false, description: "Not configured" };
    }

    try {
        const res = await withTimeout(
            fetch(`${base}/health`, {
                headers: key ? { Authorization: `Bearer ${key}` } : {},
                signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            }),
            CHECK_TIMEOUT_MS,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { id: "student-api", name: "Student API", status: "operational", group: false, description: "" };
    } catch {
        return { id: "student-api", name: "Student API", status: "major_outage", group: false, description: "Unreachable" };
    }
}

async function checkS3(): Promise<ComponentResult> {
    const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";

    try {
        const res = await withTimeout(
            fetch(`${endpoint}/minio/health/live`, {
                signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            }),
            CHECK_TIMEOUT_MS,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { id: "s3-storage", name: "S3 Storage", status: "operational", group: false, description: "" };
    } catch {
        return { id: "s3-storage", name: "S3 Storage", status: "major_outage", group: false, description: "Unreachable" };
    }
}

function deriveIndicator(components: ComponentResult[]): { indicator: Indicator; description: string } {
    const down = components.filter(
        (c) => c.status === "major_outage" || c.status === "partial_outage",
    ).length;
    const degraded = components.filter(
        (c) => c.status === "degraded_performance",
    ).length;
    const total = components.length;

    if (down === 0 && degraded === 0) return { indicator: "none", description: "All Systems Operational" };
    if (down === total) return { indicator: "critical", description: "Major System Outage" };
    if (down >= Math.ceil(total / 2)) return { indicator: "major", description: "Partial System Outage" };
    if (down > 0) return { indicator: "minor", description: "Minor Service Disruption" };
    return { indicator: "minor", description: "Degraded Performance" };
}

async function runChecks(): Promise<ComponentResult[]> {
    return Promise.all([
        checkDatabase(),
        checkBambBuddy(),
        checkStudentApi(),
        checkS3(),
    ]);
}

export async function handleStatusJson(): Promise<Response> {
    const components = await runChecks();
    const { indicator, description } = deriveIndicator(components);
    return Response.json({
        page: { id: "inventory-system", name: "Inventory System", url: "" },
        status: { indicator, description },
    });
}

export async function handleComponentsJson(): Promise<Response> {
    const components = await runChecks();
    return Response.json({ components });
}

export async function handleUnresolvedIncidents(): Promise<Response> {
    const components = await runChecks();
    const incidents = components
        .filter((c) => c.status !== "operational")
        .map((c) => ({
            id: c.id,
            name: `${c.name}: ${statusLabel(c.status)}${c.description ? ` — ${c.description}` : ""}`,
            status: "investigating",
            created_at: new Date().toISOString(),
        }));
    return Response.json({ incidents });
}

function statusLabel(s: ComponentStatus): string {
    switch (s) {
        case "degraded_performance": return "Degraded Performance";
        case "partial_outage": return "Partial Outage";
        case "major_outage": return "Major Outage";
        default: return "Operational";
    }
}

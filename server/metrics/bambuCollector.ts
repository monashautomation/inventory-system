// ─── BambuLab Metrics Collector ──────────────────────────────────────────────
// Polls the BamBuddy HTTP API on a fixed interval and caches the results
// so collectBambuMetrics() can serve Prometheus text synchronously.

import {
    getBambuddyPrometheusMetrics,
    listBambuddyPrinterStatuses,
    type BambuddyPrinterStatus,
    type AMSUnit,
    type AMSTray,
} from "@/server/lib/bambuddy";
import { formatGauge } from "./format";
import { logger as rootLogger } from "@/server/lib/logger";

const logger = rootLogger.child({ module: "bambu-metrics" });

// ─── Per-printer metric store ───────────────────────────────────────────────

interface BambuPrinterStore {
    /** Printer-level gauges (metric suffix → value). */
    gauges: Map<string, number>;
    /** AMS unit-level gauges (amsId → suffix → value). */
    amsUnit: Map<string, Map<string, number>>;
    /** AMS tray-level gauges (amsId → trayId → suffix → value). */
    amsTray: Map<string, Map<string, Map<string, number>>>;
}

interface BambuMetricsEntry {
    printerName: string;
    store: BambuPrinterStore;
}

// ─── Module-level cache ─────────────────────────────────────────────────────
// keyed by BamBuddy printer ID (as string)

const metricsCache = new Map<string, BambuMetricsEntry>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function createEmptyStore(): BambuPrinterStore {
    return {
        gauges: new Map(),
        amsUnit: new Map(),
        amsTray: new Map(),
    };
}

// ─── API response → store mapping ───────────────────────────────────────────

function processAmsUnit(store: BambuPrinterStore, unit: AMSUnit): void {
    const amsId = String(unit.id);
    const unitMap = new Map<string, number>();
    if (unit.humidity != null) unitMap.set("ams_humidity", unit.humidity);
    if (unit.temp != null) unitMap.set("ams_temp_celsius", unit.temp);
    unitMap.set("ams_dry_time_hours", unit.dry_time);
    store.amsUnit.set(amsId, unitMap);

    const amsMap = new Map<string, Map<string, number>>();
    for (const tray of unit.tray) {
        const trayId = String(tray.id);
        const trayMap = new Map<string, number>();
        trayMap.set("ams_tray_id", tray.id);
        trayMap.set("ams_tray_remain", tray.remain);
        if (tray.k != null) trayMap.set("ams_tray_k", tray.k);
        if (tray.cali_idx != null)
            trayMap.set("ams_tray_cali_idx", tray.cali_idx);
        if (tray.nozzle_temp_min != null)
            trayMap.set(
                "ams_tray_nozzle_temp_min_celsius",
                tray.nozzle_temp_min,
            );
        if (tray.nozzle_temp_max != null)
            trayMap.set(
                "ams_tray_nozzle_temp_max_celsius",
                tray.nozzle_temp_max,
            );
        if (tray.state != null) trayMap.set("ams_tray_state", tray.state);
        amsMap.set(trayId, trayMap);
    }
    store.amsTray.set(amsId, amsMap);
}

function processVtTray(store: BambuPrinterStore, tray: AMSTray): void {
    store.gauges.set("vt_tray_id", tray.id);
    store.gauges.set("vt_tray_remain", tray.remain);
    if (tray.k != null) store.gauges.set("vt_tray_k", tray.k);
    if (tray.cali_idx != null)
        store.gauges.set("vt_tray_cali_idx", tray.cali_idx);
    if (tray.nozzle_temp_min != null)
        store.gauges.set(
            "vt_tray_nozzle_temp_min_celsius",
            tray.nozzle_temp_min,
        );
    if (tray.nozzle_temp_max != null)
        store.gauges.set(
            "vt_tray_nozzle_temp_max_celsius",
            tray.nozzle_temp_max,
        );
}

function processApiStatus(
    store: BambuPrinterStore,
    status: BambuddyPrinterStatus,
): void {
    const temps = status.temperatures ?? {};

    if (temps.nozzle != null)
        store.gauges.set("nozzle_temperature", temps.nozzle);
    if (temps.target_nozzle != null)
        store.gauges.set("nozzle_target_temperature", temps.target_nozzle);
    if (temps.bed != null) store.gauges.set("bed_temperature", temps.bed);
    if (temps.target_bed != null)
        store.gauges.set("bed_target_temperature", temps.target_bed);
    if (temps.chamber != null)
        store.gauges.set("chamber_temperature", temps.chamber);

    if (status.progress != null)
        store.gauges.set("print_progress_percent", status.progress);
    if (status.remaining_time != null)
        store.gauges.set("print_remaining_time_minutes", status.remaining_time);
    if (status.layer_num != null)
        store.gauges.set("current_layer", status.layer_num);
    if (status.total_layers != null)
        store.gauges.set("total_layers", status.total_layers);

    if (status.wifi_signal != null)
        store.gauges.set("wifi_signal_dbm", status.wifi_signal);
    store.gauges.set("sdcard_present", status.sdcard ? 1 : 0);
    store.gauges.set("online_ahb", status.connected ? 1 : 0);

    const stateMap: Record<string, number> = {
        IDLE: 0,
        RUNNING: 1,
        PAUSE: 2,
        PAUSED: 2,
        FINISH: 3,
        FINISHED: 3,
        FAILED: 4,
        ERROR: 4,
    };
    store.gauges.set(
        "gcode_state",
        stateMap[(status.state ?? "IDLE").toUpperCase()] ?? 0,
    );

    // AMS units — rebuild from scratch each poll
    store.amsUnit.clear();
    store.amsTray.clear();
    for (const unit of status.ams ?? []) {
        processAmsUnit(store, unit);
    }

    // VT tray (external spool) — API returns an array; use first entry
    if ((status.vt_tray ?? []).length > 0) {
        processVtTray(store, status.vt_tray[0]);
    }
}

// ─── Metric definitions ──────────────────────────────────────────────────────
// Each entry: [suffix, help]

const PRINTER_GAUGES: [string, string][] = [
    ["nozzle_temperature", "Current temperature of the nozzle"],
    ["nozzle_target_temperature", "Target temperature of the nozzle"],
    ["bed_temperature", "Current temperature of the bed"],
    ["bed_target_temperature", "Target temperature of the bed"],
    ["chamber_temperature", "Current temperature of the chamber"],
    ["heatbreak_fan_speed", "Speed of the heatbreak fan"],
    ["cooling_fan_speed", "Speed of the cooling fan"],
    ["big_fan1_speed", "Speed of the first big fan"],
    ["big_fan2_speed", "Speed of the second big fan"],
    ["print_progress_percent", "Print progress as a percentage"],
    ["print_remaining_time_minutes", "Remaining print time in minutes"],
    ["print_speed_magnitude", "Print speed magnitude"],
    ["print_speed_level", "Print speed level"],
    ["print_error", "Print error code (0 = no error)"],
    ["wifi_signal_dbm", "WiFi signal strength in dBm"],
    ["current_layer", "Current layer number being printed"],
    ["total_layers", "Total number of layers in the print"],
    ["ams_status", "AMS (Automatic Material System) status"],
    ["ams_rfid_status", "AMS RFID status"],
    ["hardware_switch_state", "Hardware switch state"],
    ["stage", "Current stage"],
    ["print_stage", "Current print stage"],
    ["print_sub_stage", "Current print sub-stage"],
    [
        "gcode_file_prepare_percent",
        "G-code file preparation progress percentage",
    ],
    ["queue_number", "Current queue number"],
    ["queue_total", "Total items in queue"],
    ["queue_estimated_time_minutes", "Estimated queue time in minutes"],
    ["queue_status", "Queue status"],
    ["mc_print_line_number", "Current G-code line number being executed"],
    ["nozzle_diameter_mm", "Nozzle diameter in millimeters"],
    ["calibration_k", "Calibration K value"],
    ["fan_gear", "Fan gear setting"],
    ["home_flag", "Home flag status"],
    ["flag3", "Flag3 status"],
    ["calibration_version", "Calibration version"],
    ["sdcard_present", "SD card presence (1 = present, 0 = absent)"],
    ["force_upgrade", "Force upgrade (1 = enabled, 0 = disabled)"],
    [
        "gcode_state",
        "G-code state (0=idle, 1=running, 2=paused, 3=finished, 4=failed/error)",
    ],
    ["print_type", "Print type (0 = local, 1 = cloud)"],
    [
        "mess_production_state",
        "Mass production state (0 = inactive, 1 = active)",
    ],
    ["sequence_id", "Sequence ID"],
    ["msg", "Message value"],
    ["ams_exist_bits", "AMS existence bits"],
    ["tray_exist_bits", "Tray existence bits"],
    ["tray_is_bbl_bits", "Tray is BBL bits"],
    ["tray_target", "Target tray number"],
    ["tray_current", "Current tray number"],
    ["tray_previous", "Previous tray number"],
    ["tray_read_done_bits", "Tray read done bits"],
    ["tray_reading_bits", "Tray reading bits"],
    ["ams_version", "AMS version"],
    ["ams_insert_flag", "AMS insert flag (1 = inserted, 0 = not inserted)"],
    ["ams_power_on_flag", "AMS power on flag (1 = on, 0 = off)"],
    ["ipcam_dev", "IP camera device (1 = enabled, 0 = disabled)"],
    ["ipcam_record", "IP camera recording (1 = enabled, 0 = disabled)"],
    ["ipcam_timelapse", "IP camera timelapse (1 = enabled, 0 = disabled)"],
    ["ipcam_tutk_server", "IP camera TUTK server (1 = enabled, 0 = disabled)"],
    ["ipcam_mode_bits", "IP camera mode bits"],
    ["lights_report_chamber_light_mode", "Chamber light (0 = off, 1 = on)"],
    ["net_conf", "Network configuration value"],
    ["online_ahb", "Online AHB (1 = online, 0 = offline)"],
    ["online_rfid", "Online RFID (1 = online, 0 = offline)"],
    ["online_version", "Online version"],
    ["upgrade_state_sequence_id", "Upgrade state sequence ID"],
    ["upgrade_state_progress_percent", "Upgrade progress percentage"],
    [
        "upgrade_state_status",
        "Upgrade status (0=idle, 1=upgrading, 2=completed, 3=error)",
    ],
    ["upgrade_state_consistency_request", "Upgrade consistency request (1/0)"],
    ["upgrade_state_dis_state", "Upgrade dis state"],
    ["upgrade_state_err_code", "Upgrade error code"],
    ["upgrade_state_force_upgrade", "Upgrade force upgrade (1/0)"],
    ["upgrade_state_module", "Upgrade module"],
    ["upgrade_state_new_version_state", "Upgrade new version state"],
    ["upgrade_state_cur_state_code", "Upgrade current state code"],
    ["upgrade_state_idx2", "Upgrade idx2"],
    ["upload_progress_percent", "Upload progress percentage"],
    [
        "upload_status",
        "Upload status (0=idle, 1=uploading, 2=completed, 3=error)",
    ],
    ["vt_tray_id", "Virtual tray ID"],
    ["vt_tray_remain", "Virtual tray remaining material"],
    ["vt_tray_k", "Virtual tray K value"],
    ["vt_tray_n", "Virtual tray N value"],
    ["vt_tray_cali_idx", "Virtual tray calibration index"],
    ["vt_tray_diameter_mm", "Virtual tray diameter in mm"],
    ["vt_tray_temp_celsius", "Virtual tray temperature in Celsius"],
    ["vt_tray_time_hours", "Virtual tray time in hours"],
    ["vt_tray_bed_temp_type", "Virtual tray bed temperature type"],
    ["vt_tray_bed_temp_celsius", "Virtual tray bed temperature in Celsius"],
    ["vt_tray_nozzle_temp_max_celsius", "Virtual tray max nozzle temperature"],
    ["vt_tray_nozzle_temp_min_celsius", "Virtual tray min nozzle temperature"],
    ["vt_tray_ctype", "Virtual tray ctype"],
];

const AMS_UNIT_GAUGES: [string, string][] = [
    ["ams_humidity", "AMS humidity"],
    ["ams_humidity_raw", "AMS raw humidity value"],
    ["ams_temp_celsius", "AMS temperature in Celsius"],
    ["ams_dry_time_hours", "AMS dry time in hours"],
    ["ams_info", "AMS info value"],
];

const AMS_TRAY_GAUGES: [string, string][] = [
    ["ams_tray_id", "AMS tray ID"],
    ["ams_tray_state", "AMS tray state"],
    ["ams_tray_remain", "AMS tray remaining material"],
    ["ams_tray_k", "AMS tray K value"],
    ["ams_tray_n", "AMS tray N value"],
    ["ams_tray_cali_idx", "AMS tray calibration index"],
    ["ams_tray_total_len", "AMS tray total filament length"],
    ["ams_tray_diameter_mm", "AMS tray diameter in mm"],
    ["ams_tray_temp_celsius", "AMS tray temperature in Celsius"],
    ["ams_tray_time_hours", "AMS tray time in hours"],
    ["ams_tray_bed_temp_type", "AMS tray bed temperature type"],
    ["ams_tray_bed_temp_celsius", "AMS tray bed temperature in Celsius"],
    ["ams_tray_nozzle_temp_max_celsius", "AMS tray max nozzle temperature"],
    ["ams_tray_nozzle_temp_min_celsius", "AMS tray min nozzle temperature"],
    ["ams_tray_ctype", "AMS tray ctype"],
];

// ─── Polling ─────────────────────────────────────────────────────────────────

const METRICS_POLL_INTERVAL_MS = 15_000;
let pollHandle: ReturnType<typeof setInterval> | null = null;

async function pollMetrics(): Promise<void> {
    try {
        const statuses = await listBambuddyPrinterStatuses();
        const activeIds = new Set<string>();

        for (const status of statuses) {
            const key = String(status.id);
            activeIds.add(key);
            let entry = metricsCache.get(key);
            if (!entry) {
                entry = { printerName: status.name, store: createEmptyStore() };
                metricsCache.set(key, entry);
            }
            entry.printerName = status.name;
            processApiStatus(entry.store, status);
        }

        // Remove printers no longer in BamBuddy
        for (const key of metricsCache.keys()) {
            if (!activeIds.has(key)) metricsCache.delete(key);
        }
    } catch (err) {
        logger.error({ err }, "Poll failed");
    }
}

/**
 * Start periodic BamBuddy API polling for Prometheus metrics.
 * Call once at startup when Bambu metrics are enabled.
 */
export function initBambuMetricsListener(): void {
    if (pollHandle) return;
    void pollMetrics();
    pollHandle = setInterval(
        () => void pollMetrics(),
        METRICS_POLL_INTERVAL_MS,
    );
    logger.info("API polling started");
}

/** Stop polling and clear cached data. */
export function shutdownBambuMetricsListener(): void {
    if (pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
    }
    metricsCache.clear();
}

// ─── Collect formatted Prometheus text ──────────────────────────────────────

export function collectBambuMetrics(): string {
    if (metricsCache.size === 0) {
        logger.debug("Cache empty — no printers reporting yet");
        return "";
    }

    const lines: string[] = [];

    for (const [suffix, help] of PRINTER_GAUGES) {
        const samples: { value: number; labels: Record<string, string> }[] = [];
        for (const entry of metricsCache.values()) {
            const value = entry.store.gauges.get(suffix);
            if (value !== undefined) {
                samples.push({ value, labels: { printer: entry.printerName } });
            }
        }
        if (samples.length > 0) {
            lines.push(formatGauge(`bambulab_${suffix}`, help, samples));
        }
    }

    for (const [suffix, help] of AMS_UNIT_GAUGES) {
        const samples: { value: number; labels: Record<string, string> }[] = [];
        for (const entry of metricsCache.values()) {
            for (const [amsId, amsMetrics] of entry.store.amsUnit) {
                const value = amsMetrics.get(suffix);
                if (value !== undefined) {
                    samples.push({
                        value,
                        labels: { printer: entry.printerName, ams: amsId },
                    });
                }
            }
        }
        if (samples.length > 0) {
            lines.push(formatGauge(`bambulab_${suffix}`, help, samples));
        }
    }

    for (const [suffix, help] of AMS_TRAY_GAUGES) {
        const samples: { value: number; labels: Record<string, string> }[] = [];
        for (const entry of metricsCache.values()) {
            for (const [amsId, trayMap] of entry.store.amsTray) {
                for (const [trayId, trayMetrics] of trayMap) {
                    const value = trayMetrics.get(suffix);
                    if (value !== undefined) {
                        samples.push({
                            value,
                            labels: {
                                printer: entry.printerName,
                                ams: amsId,
                                tray: trayId,
                            },
                        });
                    }
                }
            }
        }
        if (samples.length > 0) {
            lines.push(formatGauge(`bambulab_${suffix}`, help, samples));
        }
    }

    return lines.join("\n");
}

/**
 * Pull Bambuddy's native Prometheus output.
 * Useful when Bambuddy already exposes curated metrics at /api/v1/metrics.
 */
export async function collectBambuPrometheusMetrics(): Promise<string> {
    const raw = await getBambuddyPrometheusMetrics();
    return raw.replace(/\r\n/g, "\n").trimEnd();
}

// ─── BambuLab Metrics Collector ──────────────────────────────────────────────
// Registers a message listener on the shared MQTT pool (bambuMqtt.ts) to
// cache every reported field, then emits Prometheus text metrics on demand.
// Ported from the Go bambulab-exporter.
//
// NO own MQTT connections — everything goes through the shared pool so
// Bambu's single-connection limit is respected.

import {
  addMessageListener,
  removeMessageListener,
} from "@/server/lib/bambuMqtt";
import type { BambuMessageListener } from "@/server/lib/bambuMqtt";
import { formatGauge } from "./format";

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

const metricsCache = new Map<string, BambuMetricsEntry>();

// ─── Safe value helpers (match Go behaviour: return 0 on failure) ───────────

function sf64(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/dBm$/i, "").replace(/%$/, "").trim();
  if (cleaned === "") return 0;
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function sbool(value: unknown): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value !== 0 ? 1 : 0;
  if (typeof value !== "string") return 0;
  const l = value.toLowerCase();
  if (["true", "1", "enable", "on"].includes(l)) return 1;
  return 0;
}

function sstr(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ─── MQTT message processing (mirrors Go collector exactly) ─────────────────

function processReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    if (key === "print" && isObj(value)) {
      processPrintReport(store, value);
    }
    // Top-level keys other than "print" are ignored (matches Go collector)
  }
}

function processPrintReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      // ── Temperatures ──
      case "nozzle_temper":
        store.gauges.set("nozzle_temperature", sf64(value));
        break;
      case "nozzle_target_temper":
        store.gauges.set("nozzle_target_temperature", sf64(value));
        break;
      case "bed_temper":
        store.gauges.set("bed_temperature", sf64(value));
        break;
      case "bed_target_temper":
        store.gauges.set("bed_target_temperature", sf64(value));
        break;
      case "chamber_temper":
        store.gauges.set("chamber_temperature", sf64(value));
        break;

      // ── Fans ──
      case "heatbreak_fan_speed":
        store.gauges.set("heatbreak_fan_speed", sf64(value));
        break;
      case "cooling_fan_speed":
        store.gauges.set("cooling_fan_speed", sf64(value));
        break;
      case "big_fan1_speed":
        store.gauges.set("big_fan1_speed", sf64(value));
        break;
      case "big_fan2_speed":
        store.gauges.set("big_fan2_speed", sf64(value));
        break;

      // ── Print progress ──
      case "mc_percent":
        store.gauges.set("print_progress_percent", sf64(value));
        break;
      case "mc_remaining_time":
        store.gauges.set("print_remaining_time_minutes", sf64(value));
        break;

      // ── Speed ──
      case "spd_mag":
        store.gauges.set("print_speed_magnitude", sf64(value));
        break;
      case "spd_lvl":
        store.gauges.set("print_speed_level", sf64(value));
        break;

      // ── Error / signal ──
      case "print_error":
        store.gauges.set("print_error", sf64(value));
        break;
      case "wifi_signal":
        store.gauges.set("wifi_signal_dbm", sf64(value));
        break;

      // ── Layers ──
      case "layer_num":
        store.gauges.set("current_layer", sf64(value));
        break;
      case "total_layer_num":
        store.gauges.set("total_layers", sf64(value));
        break;

      // ── AMS status (printer-level) ──
      case "ams_status":
        store.gauges.set("ams_status", sf64(value));
        break;
      case "ams_rfid_status":
        store.gauges.set("ams_rfid_status", sf64(value));
        break;

      // ── Hardware / stages ──
      case "hw_switch_state":
        store.gauges.set("hardware_switch_state", sf64(value));
        break;
      case "stg_cur":
        store.gauges.set("stage", sf64(value));
        break;
      case "mc_print_stage":
        store.gauges.set("print_stage", sf64(value));
        break;
      case "mc_print_sub_stage":
        store.gauges.set("print_sub_stage", sf64(value));
        break;

      // ── Queue ──
      case "gcode_file_prepare_percent":
        store.gauges.set("gcode_file_prepare_percent", sf64(value));
        break;
      case "queue_number":
        store.gauges.set("queue_number", sf64(value));
        break;
      case "queue_total":
        store.gauges.set("queue_total", sf64(value));
        break;
      case "queue_est":
        store.gauges.set("queue_estimated_time_minutes", sf64(value));
        break;
      case "queue_sts":
        store.gauges.set("queue_status", sf64(value));
        break;

      // ── Misc print fields ──
      case "mc_print_line_number":
        store.gauges.set("mc_print_line_number", sf64(value));
        break;
      case "nozzle_diameter":
        store.gauges.set("nozzle_diameter_mm", sf64(value));
        break;
      case "k":
        store.gauges.set("calibration_k", sf64(value));
        break;
      case "fan_gear":
        store.gauges.set("fan_gear", sf64(value));
        break;
      case "home_flag":
        store.gauges.set("home_flag", sf64(value));
        break;
      case "flag3":
        store.gauges.set("flag3", sf64(value));
        break;
      case "cali_version":
        store.gauges.set("calibration_version", sf64(value));
        break;

      // ── Bool-like ──
      case "sdcard":
        store.gauges.set("sdcard_present", sbool(value));
        break;
      case "force_upgrade":
        store.gauges.set("force_upgrade", sbool(value));
        break;

      // ── Enum → numeric ──
      case "gcode_state": {
        const stateMap: Record<string, number> = {
          IDLE: 0,
          RUNNING: 1,
          PAUSED: 2,
          COMPLETED: 3,
          ERROR: 4,
        };
        store.gauges.set("gcode_state", stateMap[sstr(value)] ?? 0);
        break;
      }
      case "print_type": {
        const typeMap: Record<string, number> = { local: 0, cloud: 1 };
        store.gauges.set("print_type", typeMap[sstr(value)] ?? 0);
        break;
      }
      case "mess_production_state": {
        const mpsMap: Record<string, number> = { inactive: 0, active: 1 };
        store.gauges.set("mess_production_state", mpsMap[sstr(value)] ?? 0);
        break;
      }

      case "sequence_id":
        store.gauges.set("sequence_id", sf64(value));
        break;
      case "msg":
        store.gauges.set("msg", sf64(value));
        break;

      // ── Nested sub-reports ──
      case "ipcam":
        if (isObj(value)) processIpcamReport(store, value);
        break;
      case "upload":
        if (isObj(value)) processUploadReport(store, value);
        break;
      case "net":
        if (isObj(value)) processNetReport(store, value);
        break;
      case "ams":
        if (isObj(value)) processAmsReport(store, value);
        break;
      case "vt_tray":
        if (isObj(value)) processVtTrayReport(store, value);
        break;
      case "lights_report":
        if (Array.isArray(value)) processLightsReport(store, value);
        break;
      case "upgrade_state":
        if (isObj(value)) processUpgradeStateReport(store, value);
        break;
      case "online":
        if (isObj(value)) processOnlineReport(store, value);
        break;

      // ── Known but ignored fields ──
      case "command":
      case "lifecycle":
      case "project_id":
      case "profile_id":
      case "task_id":
      case "subtask_id":
      case "subtask_name":
      case "gcode_file":
      case "stg":
      case "s_obj":
      case "filam_bak":
      case "nozzle_type":
      case "hms":
        break;

      default:
        break;
    }
  }
}

// ── IPcam ──

function processIpcamReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      case "ipcam_dev":
        store.gauges.set("ipcam_dev", sstr(value) === "1" ? 1 : 0);
        break;
      case "ipcam_record":
        store.gauges.set("ipcam_record", sstr(value) === "enable" ? 1 : 0);
        break;
      case "timelapse":
        store.gauges.set("ipcam_timelapse", sstr(value) === "enable" ? 1 : 0);
        break;
      case "tutk_server":
        store.gauges.set("ipcam_tutk_server", sstr(value) === "enable" ? 1 : 0);
        break;
      case "mode_bits":
        store.gauges.set("ipcam_mode_bits", sf64(value));
        break;
      case "resolution":
        break;
      default:
        break;
    }
  }
}

// ── Upload ──

function processUploadReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      case "progress":
        store.gauges.set("upload_progress_percent", sf64(value));
        break;
      case "status": {
        const m: Record<string, number> = {
          idle: 0,
          uploading: 1,
          completed: 2,
          error: 3,
        };
        store.gauges.set("upload_status", m[sstr(value)] ?? 0);
        break;
      }
      case "message":
        break;
      default:
        break;
    }
  }
}

// ── Net ──

function processNetReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      case "conf":
        store.gauges.set("net_conf", sf64(value));
        break;
      case "info":
        break;
      default:
        break;
    }
  }
}

// ── Lights ──

function processLightsReport(
  store: BambuPrinterStore,
  report: unknown[],
): void {
  for (const light of report) {
    if (!isObj(light)) continue;
    if (sstr(light.node) === "chamber_light" && light.mode !== undefined) {
      store.gauges.set(
        "lights_report_chamber_light_mode",
        sstr(light.mode) === "on" ? 1 : 0,
      );
    }
  }
}

// ── Online ──

function processOnlineReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      case "ahb":
        store.gauges.set("online_ahb", sbool(value));
        break;
      case "rfid":
        store.gauges.set("online_rfid", sbool(value));
        break;
      case "version":
        store.gauges.set("online_version", sf64(value));
        break;
      default:
        break;
    }
  }
}

// ── Upgrade state ──

function processUpgradeStateReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      case "sequence_id":
        store.gauges.set("upgrade_state_sequence_id", sf64(value));
        break;
      case "progress":
        store.gauges.set("upgrade_state_progress_percent", sf64(value));
        break;
      case "status": {
        const m: Record<string, number> = {
          IDLE: 0,
          UPGRADING: 1,
          COMPLETED: 2,
          ERROR: 3,
        };
        store.gauges.set("upgrade_state_status", m[sstr(value)] ?? 0);
        break;
      }
      case "consistency_request":
        store.gauges.set("upgrade_state_consistency_request", sbool(value));
        break;
      case "dis_state":
        store.gauges.set("upgrade_state_dis_state", sf64(value));
        break;
      case "err_code":
        store.gauges.set("upgrade_state_err_code", sf64(value));
        break;
      case "force_upgrade":
        store.gauges.set("upgrade_state_force_upgrade", sbool(value));
        break;
      case "module":
        store.gauges.set("upgrade_state_module", sf64(value));
        break;
      case "new_version_state":
        store.gauges.set("upgrade_state_new_version_state", sf64(value));
        break;
      case "cur_state_code":
        store.gauges.set("upgrade_state_cur_state_code", sf64(value));
        break;
      case "idx2":
        store.gauges.set("upgrade_state_idx2", sf64(value));
        break;
      case "message":
      case "new_ver_list":
        break;
      default:
        break;
    }
  }
}

// ── AMS ──

function processAmsReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      case "ams_exist_bits":
        store.gauges.set("ams_exist_bits", sf64(value));
        break;
      case "tray_exist_bits":
        store.gauges.set("tray_exist_bits", sf64(value));
        break;
      case "tray_is_bbl_bits":
        store.gauges.set("tray_is_bbl_bits", sf64(value));
        break;
      case "tray_tar":
        store.gauges.set("tray_target", sf64(value));
        break;
      case "tray_now":
        store.gauges.set("tray_current", sf64(value));
        break;
      case "tray_pre":
        store.gauges.set("tray_previous", sf64(value));
        break;
      case "tray_read_done_bits":
        store.gauges.set("tray_read_done_bits", sf64(value));
        break;
      case "tray_reading_bits":
        store.gauges.set("tray_reading_bits", sf64(value));
        break;
      case "version":
        store.gauges.set("ams_version", sf64(value));
        break;
      case "insert_flag":
        store.gauges.set("ams_insert_flag", sbool(value));
        break;
      case "power_on_flag":
        store.gauges.set("ams_power_on_flag", sbool(value));
        break;
      case "ams":
        if (Array.isArray(value)) processAmsArray(store, value);
        break;
      default:
        break;
    }
  }
}

function processAmsArray(store: BambuPrinterStore, amsArray: unknown[]): void {
  for (let amsIndex = 0; amsIndex < amsArray.length; amsIndex++) {
    const amsValue = amsArray[amsIndex];
    if (!isObj(amsValue)) continue;
    const amsId = String(amsIndex);

    for (const [key, value] of Object.entries(amsValue)) {
      switch (key) {
        case "id":
          break;
        case "humidity": {
          let m = store.amsUnit.get(amsId);
          if (!m) {
            m = new Map();
            store.amsUnit.set(amsId, m);
          }
          m.set("ams_humidity", sf64(value));
          break;
        }
        case "humidity_raw": {
          let m = store.amsUnit.get(amsId);
          if (!m) {
            m = new Map();
            store.amsUnit.set(amsId, m);
          }
          m.set("ams_humidity_raw", sf64(value));
          break;
        }
        case "temp": {
          let m = store.amsUnit.get(amsId);
          if (!m) {
            m = new Map();
            store.amsUnit.set(amsId, m);
          }
          m.set("ams_temp_celsius", sf64(value));
          break;
        }
        case "dry_time": {
          let m = store.amsUnit.get(amsId);
          if (!m) {
            m = new Map();
            store.amsUnit.set(amsId, m);
          }
          m.set("ams_dry_time_hours", sf64(value));
          break;
        }
        case "info": {
          let m = store.amsUnit.get(amsId);
          if (!m) {
            m = new Map();
            store.amsUnit.set(amsId, m);
          }
          m.set("ams_info", sf64(value));
          break;
        }
        case "tray":
          if (Array.isArray(value)) processAmsTrayArray(store, amsId, value);
          break;
        default:
          break;
      }
    }
  }
}

function processAmsTrayArray(
  store: BambuPrinterStore,
  amsId: string,
  trayArray: unknown[],
): void {
  for (let trayIndex = 0; trayIndex < trayArray.length; trayIndex++) {
    const trayValue = trayArray[trayIndex];
    if (!isObj(trayValue)) continue;
    const trayId = String(trayIndex);

    // Ensure nested map exists
    let amsMap = store.amsTray.get(amsId);
    if (!amsMap) {
      amsMap = new Map();
      store.amsTray.set(amsId, amsMap);
    }
    let trayMap = amsMap.get(trayId);
    if (!trayMap) {
      trayMap = new Map();
      amsMap.set(trayId, trayMap);
    }

    for (const [key, value] of Object.entries(trayValue)) {
      switch (key) {
        case "id":
          trayMap.set("ams_tray_id", sf64(value));
          break;
        case "state":
          trayMap.set("ams_tray_state", sf64(value));
          break;
        case "remain":
          trayMap.set("ams_tray_remain", sf64(value));
          break;
        case "k":
          trayMap.set("ams_tray_k", sf64(value));
          break;
        case "n":
          trayMap.set("ams_tray_n", sf64(value));
          break;
        case "cali_idx":
          trayMap.set("ams_tray_cali_idx", sf64(value));
          break;
        case "total_len":
          trayMap.set("ams_tray_total_len", sf64(value));
          break;
        case "tray_diameter":
          trayMap.set("ams_tray_diameter_mm", sf64(value));
          break;
        case "tray_temp":
          trayMap.set("ams_tray_temp_celsius", sf64(value));
          break;
        case "tray_time":
          trayMap.set("ams_tray_time_hours", sf64(value));
          break;
        case "bed_temp_type":
          trayMap.set("ams_tray_bed_temp_type", sf64(value));
          break;
        case "bed_temp":
          trayMap.set("ams_tray_bed_temp_celsius", sf64(value));
          break;
        case "nozzle_temp_max":
          trayMap.set("ams_tray_nozzle_temp_max_celsius", sf64(value));
          break;
        case "nozzle_temp_min":
          trayMap.set("ams_tray_nozzle_temp_min_celsius", sf64(value));
          break;
        case "ctype":
          trayMap.set("ams_tray_ctype", sf64(value));
          break;
        // Known but not metrics
        case "tag_uid":
        case "tray_id_name":
        case "tray_info_idx":
        case "tray_type":
        case "tray_sub_brands":
        case "tray_color":
        case "tray_weight":
        case "tray_uuid":
        case "xcam_info":
        case "cols":
          break;
        default:
          break;
      }
    }
  }
}

// ── VT Tray ──

function processVtTrayReport(
  store: BambuPrinterStore,
  report: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(report)) {
    switch (key) {
      case "id":
        store.gauges.set("vt_tray_id", sf64(value));
        break;
      case "remain":
        store.gauges.set("vt_tray_remain", sf64(value));
        break;
      case "k":
        store.gauges.set("vt_tray_k", sf64(value));
        break;
      case "n":
        store.gauges.set("vt_tray_n", sf64(value));
        break;
      case "cali_idx":
        store.gauges.set("vt_tray_cali_idx", sf64(value));
        break;
      case "tray_diameter":
        store.gauges.set("vt_tray_diameter_mm", sf64(value));
        break;
      case "tray_temp":
        store.gauges.set("vt_tray_temp_celsius", sf64(value));
        break;
      case "tray_time":
        store.gauges.set("vt_tray_time_hours", sf64(value));
        break;
      case "bed_temp_type":
        store.gauges.set("vt_tray_bed_temp_type", sf64(value));
        break;
      case "bed_temp":
        store.gauges.set("vt_tray_bed_temp_celsius", sf64(value));
        break;
      case "nozzle_temp_max":
        store.gauges.set("vt_tray_nozzle_temp_max_celsius", sf64(value));
        break;
      case "nozzle_temp_min":
        store.gauges.set("vt_tray_nozzle_temp_min_celsius", sf64(value));
        break;
      case "ctype":
        store.gauges.set("vt_tray_ctype", sf64(value));
        break;
      // Known but not metrics
      case "tag_uid":
      case "tray_id_name":
      case "tray_info_idx":
      case "tray_type":
      case "tray_sub_brands":
      case "tray_color":
      case "tray_weight":
      case "tray_uuid":
      case "xcam_info":
      case "cols":
        break;
      default:
        break;
    }
  }
}

// ─── Metric definitions for collection ──────────────────────────────────────
// Each entry: [suffix, help]

const PRINTER_GAUGES: [string, string][] = [
  // Print
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
  ["gcode_file_prepare_percent", "G-code file preparation progress percentage"],
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
    "G-code state (0=idle, 1=running, 2=paused, 3=completed, 4=error)",
  ],
  ["print_type", "Print type (0 = local, 1 = cloud)"],
  ["mess_production_state", "Mass production state (0 = inactive, 1 = active)"],
  ["sequence_id", "Sequence ID"],
  ["msg", "Message value"],
  // AMS printer-level
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
  // IPcam
  ["ipcam_dev", "IP camera device (1 = enabled, 0 = disabled)"],
  ["ipcam_record", "IP camera recording (1 = enabled, 0 = disabled)"],
  ["ipcam_timelapse", "IP camera timelapse (1 = enabled, 0 = disabled)"],
  ["ipcam_tutk_server", "IP camera TUTK server (1 = enabled, 0 = disabled)"],
  ["ipcam_mode_bits", "IP camera mode bits"],
  // Lights
  ["lights_report_chamber_light_mode", "Chamber light (0 = off, 1 = on)"],
  // Net
  ["net_conf", "Network configuration value"],
  // Online
  ["online_ahb", "Online AHB (1 = online, 0 = offline)"],
  ["online_rfid", "Online RFID (1 = online, 0 = offline)"],
  ["online_version", "Online version"],
  // Upgrade state
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
  // Upload
  ["upload_progress_percent", "Upload progress percentage"],
  [
    "upload_status",
    "Upload status (0=idle, 1=uploading, 2=completed, 3=error)",
  ],
  // VT tray
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

// ─── Pool message listener ──────────────────────────────────────────────────

function createEmptyStore(): BambuPrinterStore {
  return {
    gauges: new Map(),
    amsUnit: new Map(),
    amsTray: new Map(),
  };
}

let registeredListener: BambuMessageListener | null = null;

/**
 * Register the metrics listener on the shared MQTT pool.
 * Call once at startup (after initBambuMqttPool).
 */
export function initBambuMetricsListener(): void {
  if (registeredListener) return; // Already registered

  registeredListener = (
    serialNumber: string,
    printerName: string,
    msg: Record<string, unknown>,
  ) => {
    let entry = metricsCache.get(serialNumber);
    if (!entry) {
      entry = { printerName, store: createEmptyStore() };
      metricsCache.set(serialNumber, entry);
    }
    // Update name in case it changed
    entry.printerName = printerName;
    processReport(entry.store, msg);
  };

  addMessageListener(registeredListener);
  console.log(
    "[bambu-metrics] Registered metrics listener on shared MQTT pool",
  );
}

/** Unregister the metrics listener and clear cached data. */
export function shutdownBambuMetricsListener(): void {
  if (registeredListener) {
    removeMessageListener(registeredListener);
    registeredListener = null;
  }
  metricsCache.clear();
}

// ─── Collect formatted Prometheus text ──────────────────────────────────────

export function collectBambuMetrics(): string {
  if (metricsCache.size === 0) {
    console.log('[bambu-metrics] Cache empty — no printers reporting yet');
    return "";
  }

  const lines: string[] = [];

  // ── Printer-level gauges ──
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

  // ── AMS unit-level gauges ──
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

  // ── AMS tray-level gauges ──
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

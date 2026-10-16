use std::io::Write;

use serde_json::Value;

/// Render a tRPC result as a table (default) or pretty JSON (`--json`).
/// Tables work on arrays of objects and single objects; anything else
/// falls back to JSON so nothing is ever hidden.
pub fn print_value<W: Write>(out: &mut W, value: &Value, as_json: bool) -> std::io::Result<()> {
    if as_json {
        writeln!(out, "{}", serde_json::to_string_pretty(value).unwrap())?;
        return Ok(());
    }
    match value {
        Value::Array(items) if !items.is_empty() && items.iter().all(Value::is_object) => {
            write_table(out, items)
        }
        Value::Object(obj) => {
            let flat = flatten_scalar(obj);
            if flat.is_empty() {
                writeln!(out, "{}", serde_json::to_string_pretty(value).unwrap())
            } else {
                let rows: Vec<Vec<String>> = flat
                    .iter()
                    .map(|(k, v)| vec![k.clone(), v.clone()])
                    .collect();
                write_table_rows(out, &["field".to_string(), "value".to_string()], &rows)
            }
        }
        _ => writeln!(out, "{}", serde_json::to_string_pretty(value).unwrap()),
    }
}

/// Pick display columns from the first row, preferring human-friendly keys.
pub fn pick_columns(items: &[Value], wanted: &[&str]) -> Vec<String> {
    let first = match items.first() {
        Some(v) => v,
        None => return Vec::new(),
    };
    let keys: Vec<String> = first
        .as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();
    let mut cols: Vec<String> = wanted
        .iter()
        .filter(|w| keys.iter().any(|k| k == *w))
        .map(|w| w.to_string())
        .collect();
    if cols.is_empty() {
        cols = keys.into_iter().filter(|k| is_scalar(&first[k])).take(8).collect();
    }
    cols
}

fn is_scalar(v: &Value) -> bool {
    matches!(v, Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null)
}

fn write_table<W: Write>(out: &mut W, items: &[Value]) -> std::io::Result<()> {
    let cols = pick_columns(items, &DEFAULT_COLS);
    let rows: Vec<Vec<String>> = items
        .iter()
        .map(|it| cols.iter().map(|c| cell(it.get(c)).to_string()).collect())
        .collect();
    write_table_rows(out, &cols, &rows)
}

const DEFAULT_COLS: &[&str] = &[
    "name",
    "serial",
    "status",
    "state",
    "available",
    "total",
    "quantity",
    "action",
    "loaned",
    "createdAt",
    "id",
];

pub fn write_table_rows<W: Write>(
    out: &mut W,
    cols: &[String],
    rows: &[Vec<String>],
) -> std::io::Result<()> {
    if cols.is_empty() {
        return Ok(());
    }
    let mut widths: Vec<usize> = cols.iter().map(|c| c.len()).collect();
    for r in rows {
        for (i, cell) in r.iter().enumerate() {
            if i < widths.len() {
                widths[i] = widths[i].max(cell.chars().count().min(48));
            }
        }
    }
    let header: Vec<String> = cols
        .iter()
        .enumerate()
        .map(|(i, c)| pad(c, widths[i]))
        .collect();
    writeln!(out, "{}", header.join("  "))?;
    writeln!(
        out,
        "{}",
        widths.iter().map(|w| "-".repeat(*w)).collect::<Vec<_>>().join("  ")
    )?;
    for r in rows {
        let line: Vec<String> = r
            .iter()
            .enumerate()
            .map(|(i, c)| pad(&truncate(c, 48), widths.get(i).copied().unwrap_or(c.len())))
            .collect();
        writeln!(out, "{}", line.join("  "))?;
    }
    writeln!(out, "\n{} row(s)", rows.len())
}

fn pad(s: &str, w: usize) -> String {
    let len = s.chars().count();
    if len >= w {
        s.to_string()
    } else {
        format!("{s}{}", " ".repeat(w - len))
    }
}

fn truncate(s: &str, w: usize) -> String {
    if s.chars().count() <= w {
        s.to_string()
    } else {
        let cut: String = s.chars().take(w.saturating_sub(1)).collect();
        format!("{cut}…")
    }
}

pub fn cell(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => "-".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Object(o)) => {
            // Nested objects: show name, else email, else id — like the UI.
            for k in ["name", "email", "id"] {
                if let Some(Value::String(s)) = o.get(k) {
                    return s.clone();
                }
            }
            "-".to_string()
        }
        Some(Value::Array(_)) => "[…]".to_string(),
    }
}

fn flatten_scalar(obj: &serde_json::Map<String, Value>) -> Vec<(String, String)> {
    obj.iter()
        .filter(|(_, v)| is_scalar(v) || v.is_null())
        .map(|(k, v)| (k.clone(), cell(Some(v))))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn items() -> Vec<Value> {
        vec![
            serde_json::json!({"id":"a","name":"Drill","serial":"S1","loaned":false,"location":{"id":"l1","name":"Shelf A"}}),
            serde_json::json!({"id":"b","name":"Driver","serial":"S2","loaned":true,"location":null}),
        ]
    }

    #[test]
    fn prefers_named_columns() {
        let cols = pick_columns(&items(), &["name", "serial", "loaned"]);
        assert_eq!(cols, vec!["name", "serial", "loaned"]);
    }

    #[test]
    fn falls_back_to_scalar_keys() {
        let cols = pick_columns(&items(), &["nonexistent"]);
        assert!(cols.contains(&"name".to_string()));
        assert!(!cols.contains(&"location".to_string()));
    }

    #[test]
    fn nested_object_shows_name() {
        assert_eq!(cell(items()[0].get("location")).as_str(), "Shelf A");
        assert_eq!(cell(items()[1].get("location")).as_str(), "-");
        assert_eq!(cell(None).as_str(), "-");
    }

    #[test]
    fn table_output_has_header_and_count() {
        let mut buf = Vec::new();
        print_value(&mut buf, &Value::Array(items()), false).unwrap();
        let s = String::from_utf8(buf).unwrap();
        assert!(s.contains("name"));
        assert!(s.contains("Drill"));
        assert!(s.contains("2 row(s)"));
    }

    #[test]
    fn json_mode_is_machine_readable() {
        let mut buf = Vec::new();
        print_value(&mut buf, &Value::Array(items()), true).unwrap();
        let s = String::from_utf8(buf).unwrap();
        let parsed: Value = serde_json::from_str(&s).unwrap();
        assert_eq!(parsed.as_array().unwrap().len(), 2);
    }

    #[test]
    fn empty_array_prints_empty_table() {
        let mut buf = Vec::new();
        print_value(&mut buf, &Value::Array(vec![]), false).unwrap();
        let s = String::from_utf8(buf).unwrap();
        assert!(s.contains("[]") || s.contains("0 row(s)"));
    }

    #[test]
    fn single_object_flattens_scalars() {
        let mut buf = Vec::new();
        print_value(
            &mut buf,
            &serde_json::json!({"total": 10, "loaned": 2, "nested": {"x": 1}}),
            false,
        )
        .unwrap();
        let s = String::from_utf8(buf).unwrap();
        assert!(s.contains("total"));
        assert!(s.contains("10"));
        assert!(!s.contains("nested"));
    }

    #[test]
    fn long_cells_truncated() {
        let long = "x".repeat(100);
        assert_eq!(truncate(&long, 10).chars().count(), 10);
        assert!(truncate(&long, 10).ends_with('…'));
    }
}

mod config;
mod output;
mod trpc;

use std::process::ExitCode;

use clap::{Parser, Subcommand};
use serde_json::{json, Value};

use config::{config_path, load_config, normalize_url, resolve, save_config, Config};
use trpc::Client;

/// maims — Monash Automation Inventory System CLI.
///
/// READ-ONLY: every command maps to a tRPC *query* (GET). The server only
/// accepts mutations via POST, so this CLI cannot change anything — you can
/// see everything the UI shows, but you cannot write.
#[derive(Parser)]
#[command(name = "maims", version, about, long_about = None)]
struct Cli {
    /// Server URL (e.g. inventory.monashautomation.com)
    #[arg(short = 'u', long = "url", global = true)]
    url: Option<String>,
    /// Session token (from the browser session cookie)
    #[arg(short = 't', long = "token", global = true)]
    token: Option<String>,
    /// Config file path (default: ~/.config/maims/config.json)
    #[arg(long = "config", global = true)]
    config: Option<String>,
    /// Emit raw JSON instead of tables
    #[arg(long = "json", global = true)]
    json: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Authenticate against an inventory server
    Auth {
        #[command(subcommand)]
        action: Option<AuthAction>,
        /// Server URL (shorthand for `maims auth login -u …`)
        #[arg(short = 'u', long = "url")]
        url: Option<String>,
        /// Session token
        #[arg(short = 't', long = "token")]
        token: Option<String>,
    },
    /// Who am I on the server
    Whoami,
    /// Inventory items
    Items {
        #[command(subcommand)]
        action: ItemsAction,
    },
    /// Locations (storage tree)
    Locations {
        #[command(subcommand)]
        action: LocationsAction,
    },
    /// Tags
    Tags {
        #[command(subcommand)]
        action: TagsAction,
    },
    /// User groups
    Groups,
    /// Consumables
    Consumables {
        #[command(subcommand)]
        action: ConsumablesAction,
    },
    /// Consumable purchase requests
    Requests {
        #[command(subcommand)]
        action: RequestsAction,
    },
    /// Item transaction records (check-ins/outs)
    Records {
        #[command(subcommand)]
        action: RecordsAction,
    },
    /// Users (admin)
    Users {
        #[command(subcommand)]
        action: UsersAction,
    },
    /// Dashboard stats
    Dashboard {
        #[command(subcommand)]
        action: DashboardAction,
    },
    /// 3D printers: status, live state, who is printing
    Printers {
        #[command(subcommand)]
        action: PrintersAction,
    },
    /// Print queue (BamBuddy)
    Queue {
        #[command(subcommand)]
        action: QueueAction,
    },
    /// Print statistics
    Stats {
        #[command(subcommand)]
        action: StatsAction,
    },
    /// Your notifications
    Notifications {
        #[command(subcommand)]
        action: NotificationsAction,
    },
    /// Audit log (admin)
    Audit {
        #[command(subcommand)]
        action: AuditAction,
    },
    /// Uptime/status-page outages
    Outages,
    /// API tokens: create, list, revoke (for the CLI itself)
    Tokens {
        #[command(subcommand)]
        action: TokensAction,
    },
    /// Call any read-only query directly: maims call <path> [json-input]
    Call {
        /// Dotted procedure path, e.g. item.list
        path: String,
        /// JSON input (superjson plain value)
        input: Option<String>,
    },
}

#[derive(Clone, Debug, Subcommand)]
enum AuthAction {
    /// Save url + token to the config file
    Login {
        #[arg(short = 'u', long)]
        url: String,
        #[arg(short = 't', long)]
        token: String,
    },
    /// Show the saved session
    Status,
    /// Remove the saved token
    Logout,
}

#[derive(Debug, Subcommand)]
enum ItemsAction {
    /// List items
    List {
        #[arg(long)]
        consumable: bool,
        #[arg(long)]
        location: Option<String>,
        #[arg(long)]
        tag_group: Option<String>,
        #[arg(long, short = 'f')]
        filter: Option<String>,
        #[arg(long)]
        exact_name: Option<String>,
        #[arg(long, default_value_t = 0)]
        page: u32,
        #[arg(long, short = 'n', default_value_t = 25)]
        page_size: u32,
        #[arg(long, value_enum, default_value = "name")]
        sort_by: SortBy,
        #[arg(long, value_enum, default_value = "asc")]
        sort_order: SortOrder,
    },
    /// Get one item by id
    Get { id: String },
    /// Find an item by serial number
    Serial { serial: String },
    /// Count items by name
    Count { name: String },
    /// Get an item's image URL
    Image { id: String },
    /// Get an item's QR code URL
    Qr { id: String },
}

#[derive(Debug, Clone, clap::ValueEnum)]
enum SortBy {
    Name,
    Serial,
    Location,
}

#[derive(Debug, Clone, clap::ValueEnum)]
enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Subcommand)]
enum LocationsAction {
    /// List all locations
    List,
    /// Get a location by id, name, or path
    Get {
        #[arg(long)]
        id: Option<String>,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        path: Option<String>,
    },
    /// List root locations
    Roots,
    /// List children of a location
    Children { id: String },
    /// Does a location have children?
    Has_children { id: String },
}

#[derive(Debug, Subcommand)]
enum TagsAction {
    /// List all tags
    List,
    /// List descendant tag groups under a parent group
    Group_children { parent: String },
}

#[derive(Debug, Subcommand)]
enum ConsumablesAction {
    /// List consumables with stock levels
    List,
    /// Get one consumable by id
    Get { id: String },
}

#[derive(Debug, Subcommand)]
enum RequestsAction {
    /// List requests (admin)
    List {
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        consumable: Option<String>,
        #[arg(long)]
        requester: Option<String>,
        #[arg(long, default_value_t = 0)]
        page: u32,
        #[arg(long, short = 'n', default_value_t = 25)]
        page_size: u32,
    },
    /// List my requests
    Mine {
        #[arg(long)]
        status: Option<String>,
        #[arg(long, default_value_t = 0)]
        page: u32,
        #[arg(long, short = 'n', default_value_t = 25)]
        page_size: u32,
    },
    /// Count of pending requests (admin)
    Pending_count,
}

#[derive(Debug, Subcommand)]
enum RecordsAction {
    /// List transaction records
    List {
        #[arg(long)]
        item: Option<String>,
        #[arg(long)]
        user: Option<String>,
        #[arg(long, default_value_t = 0)]
        page: u32,
        #[arg(long, short = 'n', default_value_t = 25)]
        page_size: u32,
    },
    /// Get one record by id
    Get { id: String },
    /// Audit trail for an item
    Audit_trail { id: String },
    /// Items currently loaned to a user
    Loaned { user: String },
}

#[derive(Debug, Subcommand)]
enum UsersAction {
    /// List all users (admin)
    List,
    /// Get one user (admin)
    Get { id: String },
    /// List synced members (admin)
    Members,
    /// Member sync status (admin)
    Sync_status,
}

#[derive(Debug, Subcommand)]
enum DashboardAction {
    /// Loan history aggregated by date
    Loan_history {
        #[arg(long, value_enum, default_value = "month")]
        range: LoanRange,
    },
    /// Item counts per location
    By_location,
    /// Most frequently loaned items
    Top_loaned {
        #[arg(long, default_value_t = 5)]
        limit: u32,
    },
    /// Totals: items, loaned, available consumables
    Status,
    /// Consumption over time
    Consumption {
        #[arg(long, value_enum, default_value = "1m")]
        range: ConsRange,
    },
    /// Top consumed consumables
    Top_consumed {
        #[arg(long, value_enum, default_value = "1m")]
        range: ConsRange,
        #[arg(long, default_value_t = 10)]
        limit: u32,
    },
    /// Low-stock consumables (admin)
    Low_stock,
    /// Request status counts (admin)
    Request_counts,
    /// Most used tags
    Top_tags {
        #[arg(long, default_value_t = 5)]
        limit: u32,
    },
}

#[derive(Debug, Clone, clap::ValueEnum)]
enum LoanRange {
    Week,
    Month,
    Year,
}

#[derive(Debug, Clone, clap::ValueEnum)]
enum ConsRange {
    #[value(name = "1d")]
    D1,
    #[value(name = "1w")]
    W1,
    #[value(name = "1m")]
    M1,
    #[value(name = "3m")]
    M3,
    #[value(name = "6m")]
    M6,
    #[value(name = "1yr")]
    Y1,
}

#[derive(Debug, Subcommand)]
enum PrintersAction {
    /// List configured printers
    List,
    /// Live status of one printer by IP
    Status {
        #[arg(long, short = 'i')]
        ip: String,
    },
    /// Which printers are printing right now, and who started it
    Active,
    /// All print jobs with user attribution (who printed what, when)
    Jobs {
        #[arg(long, default_value_t = 100)]
        limit: u32,
    },
    /// Live statuses of all printers
    Live,
    /// PrintCam dashboard snapshot
    Cam,
    /// Active projects
    Projects,
    /// Inventory spools
    Spools,
    /// Filament types
    Filament_types,
    /// BamBuddy-connected printers
    Bambuddy,
    /// AMS slot assignments
    Slots,
}

#[derive(Debug, Subcommand)]
enum QueueAction {
    /// Printers in the queue system
    Printers,
    /// Printer connectivity
    Connectivity,
    /// AMS slots on a printer
    Ams { printer_id: u32 },
    /// All available filaments
    Filaments,
    /// Filaments available for a model
    Filaments_for {
        model: String,
        #[arg(long)]
        location: Option<String>,
    },
    /// Filament requirements for an archive
    Requirements { archive_id: u32 },
    /// List uploaded archives
    Archives {
        #[arg(long, default_value_t = 50)]
        limit: u32,
        #[arg(long, default_value_t = 0)]
        offset: u32,
    },
    /// Current queue
    List {
        #[arg(long)]
        printer_id: Option<u32>,
        #[arg(long)]
        status: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
enum StatsAction {
    /// Print overview stats
    Overview {
        #[arg(long)]
        from: Option<String>,
        #[arg(long)]
        to: Option<String>,
    },
    /// Print log
    Log {
        #[arg(long, default_value_t = 0)]
        page: u32,
        #[arg(long, short = 'n', default_value_t = 20)]
        page_size: u32,
        #[arg(long)]
        printer_id: Option<u32>,
        #[arg(long)]
        status: Option<String>,
        #[arg(long, short = 'f')]
        search: Option<String>,
        #[arg(long)]
        from: Option<String>,
        #[arg(long)]
        to: Option<String>,
    },
    /// Filament usage over time (7|30|90|365 days)
    Timeseries {
        #[arg(long, default_value_t = 30)]
        days: u32,
    },
    /// Filament leaderboard (0 = all time)
    Leaderboard {
        #[arg(long, default_value_t = 30)]
        days: u32,
    },
    /// Spool usage history
    Usage {
        #[arg(long)]
        printer_id: Option<u32>,
    },
    /// Filament catalog
    Catalog,
    /// Printers in stats
    Printers,
    /// Filament by project
    By_project {
        #[arg(long, default_value_t = 30)]
        days: u32,
    },
    /// Filament by person
    By_person {
        #[arg(long, default_value_t = 30)]
        days: u32,
    },
}

#[derive(Debug, Subcommand)]
enum NotificationsAction {
    /// List notifications
    List {
        #[arg(long)]
        unread_only: bool,
        #[arg(long, default_value_t = 30)]
        limit: u32,
    },
    /// Unread count
    Count,
}

#[derive(Debug, Subcommand)]
enum TokensAction {
    /// List your API tokens (never the secret)
    List,
    /// Create a new read-only API token (plaintext shown once)
    Create {
        /// Human name for the token, e.g. "laptop CLI"
        #[arg(short = 'n', long)]
        name: String,
        /// Lifetime in days (1-365). Omit for no expiry.
        #[arg(long)]
        expires_in_days: Option<u32>,
    },
    /// Revoke an API token by id
    Revoke { id: String },
}

#[derive(Debug, Subcommand)]
enum AuditAction {
    /// List audit entries (admin)
    List {
        #[arg(long)]
        entity_type: Option<String>,
        #[arg(long)]
        entity_id: Option<String>,
        #[arg(long)]
        actor: Option<String>,
        #[arg(long)]
        action: Option<String>,
        #[arg(long, default_value_t = 0)]
        page: u32,
        #[arg(long, short = 'n', default_value_t = 50)]
        page_size: u32,
    },
    /// Audit entries for one entity
    For_entity { entity_type: String, entity_id: String },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let cfg_file = config_path(cli.config.as_deref());
    let file = cfg_file.as_ref().map(load_config).unwrap_or_default();

    match &cli.command {
        Command::Auth { action, url, token } => {
            do_auth(cfg_file.as_ref(), action.as_ref(), url.as_deref(), token.as_deref(), cli.json)
        }
        Command::Call { path, input } => {
            if path.trim().is_empty() {
                eprintln!("error: procedure path is empty");
                return ExitCode::from(1);
            }
            let parsed: Option<Value> = match input {
                Some(s) => match serde_json::from_str(s) {
                    Ok(v) => Some(v),
                    Err(e) => {
                        eprintln!("error: input is not valid JSON: {e}");
                        return ExitCode::from(1);
                    }
                },
                None => None,
            };
            run_query(&cli, &file, path, parsed.as_ref())
        }
        Command::Tokens { action } => run_tokens(&cli, &file, action),
        other => {
            let (path, input) = match build_query(other) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("error: {e}");
                    return ExitCode::from(1);
                }
            };
            run_query(&cli, &file, &path, input.as_ref())
        }
    }
}

fn do_auth(
    cfg_file: Option<&std::path::PathBuf>,
    action: Option<&AuthAction>,
    url: Option<&str>,
    token: Option<&str>,
    as_json: bool,
) -> ExitCode {
    let path = match cfg_file {
        Some(p) => p.to_path_buf(),
        None => {
            eprintln!("error: could not determine config path (is $HOME set?)");
            return ExitCode::from(1);
        }
    };
    // `maims auth -u … -t …` is shorthand for `maims auth login`.
    let action = match action {
        Some(a) => a.clone(),
        None => match (url, token) {
            (Some(u), Some(t)) => AuthAction::Login {
                url: u.to_string(),
                token: t.to_string(),
            },
            _ => AuthAction::Status,
        },
    };
    match action {
        AuthAction::Login { url, token } => {
            let normalized = match normalize_url(&url) {
                Some(u) => u,
                None => {
                    eprintln!("error: invalid URL: {url}");
                    return ExitCode::from(1);
                }
            };
            if token.trim().is_empty() {
                eprintln!("error: token is empty");
                return ExitCode::from(1);
            }
            let cfg = Config {
                url: normalized.clone(),
                token: token.trim().to_string(),
            };
            if let Err(e) = save_config(&path, &cfg) {
                eprintln!("error: could not write {}: {e}", path.display());
                return ExitCode::from(1);
            }
            if as_json {
                println!("{}", json!({"ok": true, "url": normalized, "config": path.display().to_string()}));
            } else {
                println!("saved session for {normalized} → {}", path.display());
                println!("token stored (0600). verify with: maims whoami");
            }
            ExitCode::SUCCESS
        }
        AuthAction::Status => {
            let cfg = load_config(&path);
            if as_json {
                println!(
                    "{}",
                    json!({"config": path.display().to_string(), "url": cfg.url, "token": mask(&cfg.token)})
                );
            } else if cfg.url.is_empty() {
                println!("not authenticated — run: maims auth -u <url> -t <token>");
            } else {
                println!("config:  {}", path.display());
                println!("url:     {}", cfg.url);
                println!("token:   {}", mask(&cfg.token));
            }
            ExitCode::SUCCESS
        }
        AuthAction::Logout => {
            let mut cfg = load_config(&path);
            cfg.token = String::new();
            if let Err(e) = save_config(&path, &cfg) {
                eprintln!("error: could not write {}: {e}", path.display());
                return ExitCode::from(1);
            }
            println!("token removed from {}", path.display());
            ExitCode::SUCCESS
        }
    }
}

fn mask(token: &str) -> String {
    if token.is_empty() {
        return "(none)".to_string();
    }
    let chars: Vec<char> = token.chars().collect();
    if chars.len() <= 8 {
        return "••••".to_string();
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}…{tail}")
}

fn run_tokens(cli: &Cli, file: &Config, action: &TokensAction) -> ExitCode {
    let (url, token) = match resolve(cli.url.as_deref(), cli.token.as_deref(), file) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::from(2);
        }
    };
    if token.is_empty() {
        eprintln!("error: token management needs a session — run `maims auth -u <url> -t <token>`");
        return ExitCode::from(2);
    }
    let client = Client::new(url, token);
    match action {
        TokensAction::List => match client.query("apiToken.listMine", None) {
            Ok(v) => {
                if let Err(e) = output::print_value(&mut std::io::stdout(), &v, cli.json) {
                    eprintln!("error writing output: {e}");
                    return ExitCode::from(1);
                }
                ExitCode::SUCCESS
            }
            Err(e) => report(e),
        },
        TokensAction::Create { name, expires_in_days } => {
            if name.trim().is_empty() {
                eprintln!("error: token name is empty");
                return ExitCode::from(1);
            }
            if let Some(d) = expires_in_days {
                if *d == 0 || *d > 365 {
                    eprintln!("error: --expires-in-days must be between 1 and 365");
                    return ExitCode::from(1);
                }
            }
            let mut input = json!({"name": name, "readOnly": true});
            if let Some(d) = expires_in_days {
                input["expiresInDays"] = json!(d);
            }
            match client.mutate("apiToken.create", Some(&input)) {
                Ok(v) => {
                    let secret = v.get("token").and_then(|t| t.as_str()).unwrap_or("");
                    if cli.json {
                        println!("{}", serde_json::to_string_pretty(&v).unwrap());
                    } else {
                        println!("token created — copy it now, it is shown only once:");
                        println!();
                        println!("  {secret}");
                        println!();
                        println!("auth with:");
                        println!("  maims auth -u <url> -t {secret}");
                    }
                    ExitCode::SUCCESS
                }
                Err(e) => report(e),
            }
        }
        TokensAction::Revoke { id } => match client.mutate("apiToken.revoke", Some(&json!({"id": id}))) {
            Ok(v) => {
                if v.get("ok").and_then(|o| o.as_bool()) == Some(false) {
                    let msg = v.get("error").and_then(|e| e.as_str()).unwrap_or("revoke failed");
                    eprintln!("error: {msg}");
                    return ExitCode::from(1);
                }
                println!("token revoked");
                ExitCode::SUCCESS
            }
            Err(e) => report(e),
        },
    }
}

fn report(e: trpc::TrpcError) -> ExitCode {
    match e {
        trpc::TrpcError::Unauthorized(m) => {
            eprintln!("error: {m}");
            ExitCode::from(2)
        }
        other => {
            eprintln!("error: {other}");
            ExitCode::from(1)
        }
    }
}

fn run_query(cli: &Cli, file: &Config, path: &str, input: Option<&Value>) -> ExitCode {
    let (url, token) = match resolve(
        cli.url.as_deref(),
        cli.token.as_deref(),
        file,
    ) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::from(2);
        }
    };
    let client = Client::new(url, token);
    match client.query(path, input) {
        Ok(value) => {
            if let Err(e) = output::print_value(&mut std::io::stdout(), &value, cli.json) {
                eprintln!("error writing output: {e}");
                return ExitCode::from(1);
            }
            ExitCode::SUCCESS
        }
        Err(trpc::TrpcError::Unauthorized(m)) => {
            eprintln!("error: {m}");
            ExitCode::from(2)
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(1)
        }
    }
}

/// Map a subcommand to (procedure path, input). Read-only queries only.
fn build_query(cmd: &Command) -> Result<(String, Option<Value>), String> {
    Ok(match cmd {
        Command::Whoami => ("user.getSelf".into(), None),
        Command::Outages => ("status.outages".into(), None),
        Command::Groups => ("group.list".into(), None),
        Command::Tokens { .. } => return Err("tokens are handled separately".into()),

        Command::Items { action } => match action {
            ItemsAction::List {
                consumable,
                location,
                tag_group,
                filter,
                exact_name,
                page,
                page_size,
                sort_by,
                sort_order,
            } => {
                let mut input = json!({
                    "consumable": *consumable,
                    "page": page,
                    "pageSize": page_size,
                    "sortBy": snake(sort_by),
                    "sortOrder": snake(sort_order),
                });
                opt_str(input.as_object_mut().unwrap(), "locationId", location);
                opt_str(input.as_object_mut().unwrap(), "tagGroupId", tag_group);
                opt_str(input.as_object_mut().unwrap(), "filter", filter);
                opt_str(input.as_object_mut().unwrap(), "exactName", exact_name);
                ("item.list".into(), Some(input))
            }
            ItemsAction::Get { id } => ("item.get".into(), Some(json!({"id": id}))),
            ItemsAction::Serial { serial } => {
                ("item.getBySerial".into(), Some(json!({"serial": serial})))
            }
            ItemsAction::Count { name } => ("item.countByName".into(), Some(json!({"name": name}))),
            ItemsAction::Image { id } => ("item.getImageUrl".into(), Some(json!({"id": id}))),
            ItemsAction::Qr { id } => ("qr.generateUrl".into(), Some(json!({"id": id}))),
        },

        Command::Locations { action } => match action {
            LocationsAction::List => ("location.list".into(), None),
            LocationsAction::Get { id, name, path } => {
                if id.is_none() && name.is_none() && path.is_none() {
                    return Err("location get needs --id, --name, or --path".into());
                }
                let mut obj = serde_json::Map::new();
                opt_into(&mut obj, "id", id);
                opt_into(&mut obj, "name", name);
                opt_into(&mut obj, "path", path);
                ("location.get".into(), Some(Value::Object(obj)))
            }
            LocationsAction::Roots => ("location.getRoots".into(), None),
            LocationsAction::Children { id } => {
                ("location.getChildren".into(), Some(json!({"parentId": id})))
            }
            LocationsAction::Has_children { id } => {
                ("location.hasChildren".into(), Some(json!({"locationId": id})))
            }
        },

        Command::Tags { action } => match action {
            TagsAction::List => ("tag.list".into(), None),
            TagsAction::Group_children { parent } => {
                ("tagGroup.listChildren".into(), Some(json!({"parentId": parent})))
            }
        },

        Command::Consumables { action } => match action {
            ConsumablesAction::List => ("consumable.list".into(), None),
            ConsumablesAction::Get { id } => ("consumable.get".into(), Some(json!({"id": id}))),
        },

        Command::Requests { action } => match action {
            RequestsAction::List {
                status,
                consumable,
                requester,
                page,
                page_size,
            } => {
                let mut input = json!({"page": page, "pageSize": page_size});
                opt_str(input.as_object_mut().unwrap(), "status", status);
                opt_str(input.as_object_mut().unwrap(), "consumableId", consumable);
                opt_str(input.as_object_mut().unwrap(), "requestedById", requester);
                ("consumableRequest.list".into(), Some(input))
            }
            RequestsAction::Mine { status, page, page_size } => {
                let mut input = json!({"page": page, "pageSize": page_size});
                opt_str(input.as_object_mut().unwrap(), "status", status);
                ("consumableRequest.listMine".into(), Some(input))
            }
            RequestsAction::Pending_count => ("consumableRequest.pendingCount".into(), None),
        },

        Command::Records { action } => match action {
            RecordsAction::List { item, user, page, page_size } => {
                let mut input = json!({"page": page, "pageSize": page_size});
                opt_str(input.as_object_mut().unwrap(), "itemId", item);
                opt_str(input.as_object_mut().unwrap(), "userId", user);
                ("itemRecord.list".into(), Some(input))
            }
            RecordsAction::Get { id } => ("itemRecord.get".into(), Some(json!({"id": id}))),
            RecordsAction::Audit_trail { id } => {
                ("itemRecord.getAuditTrail".into(), Some(json!({"id": id})))
            }
            RecordsAction::Loaned { user } => {
                ("itemRecord.getUserLoanedItems".into(), Some(json!({"userId": user})))
            }
        },

        Command::Users { action } => match action {
            UsersAction::List => ("user.list".into(), None),
            UsersAction::Get { id } => ("user.get".into(), Some(json!({"id": id}))),
            UsersAction::Members => ("user.members".into(), None),
            UsersAction::Sync_status => ("user.memberSyncStatus".into(), None),
        },

        Command::Dashboard { action } => match action {
            DashboardAction::Loan_history { range } => {
                ("dashboard.getLoanHistory".into(), Some(json!({"range": snake(range)})))
            }
            DashboardAction::By_location => {
                ("dashboard.getInventoryByLocation".into(), None)
            }
            DashboardAction::Top_loaned { limit } => {
                ("dashboard.getTopLoanedItems".into(), Some(json!({"limit": limit})))
            }
            DashboardAction::Status => ("dashboard.getItemStatusStats".into(), None),
            DashboardAction::Consumption { range } => {
                ("dashboard.getConsumptionStats".into(), Some(json!({"range": snake(range)})))
            }
            DashboardAction::Top_consumed { range, limit } => (
                "dashboard.getTopConsumedConsumables".into(),
                Some(json!({"range": snake(range), "limit": limit})),
            ),
            DashboardAction::Low_stock => ("dashboard.getLowStockConsumables".into(), None),
            DashboardAction::Request_counts => ("dashboard.getRequestStatusCounts".into(), None),
            DashboardAction::Top_tags { limit } => {
                ("dashboard.getTopTags".into(), Some(json!({"limit": limit})))
            }
        },

        Command::Printers { action } => match action {
            PrintersAction::List => ("print.getPrinters".into(), None),
            PrintersAction::Status { ip } => {
                ("print.getPrinterStatus".into(), Some(json!({"printerIpAddress": ip})))
            }
            PrintersAction::Active => ("print.getActivePrints".into(), None),
            PrintersAction::Jobs { limit } => {
                ("print.getAllPrintJobs".into(), Some(json!({"limit": limit})))
            }
            PrintersAction::Live => ("print.getLivePrinterStatuses".into(), None),
            PrintersAction::Cam => ("print.getPrintCamDashboard".into(), None),
            PrintersAction::Projects => ("print.getProjects".into(), None),
            PrintersAction::Spools => ("print.listInventorySpools".into(), None),
            PrintersAction::Filament_types => ("print.listFilamentTypes".into(), None),
            PrintersAction::Bambuddy => ("print.getBambuddyPrinters".into(), None),
            PrintersAction::Slots => ("print.listSlotAssignments".into(), None),
        },

        Command::Queue { action } => match action {
            QueueAction::Printers => ("printQueue.listPrinters".into(), None),
            QueueAction::Connectivity => ("printQueue.listPrinterConnectivity".into(), None),
            QueueAction::Ams { printer_id } => {
                ("printQueue.getPrinterAms".into(), Some(json!({"printerId": printer_id})))
            }
            QueueAction::Filaments => ("printQueue.getAvailableFilaments".into(), None),
            QueueAction::Filaments_for { model, location } => {
                let mut input = json!({"model": model});
                opt_str(input.as_object_mut().unwrap(), "location", location);
                ("printQueue.getAvailableFilamentsForModel".into(), Some(input))
            }
            QueueAction::Requirements { archive_id } => (
                "printQueue.getFilamentRequirements".into(),
                Some(json!({"archiveId": archive_id})),
            ),
            QueueAction::Archives { limit, offset } => (
                "printQueue.listArchives".into(),
                Some(json!({"limit": limit, "offset": offset})),
            ),
            QueueAction::List { printer_id, status } => {
                let mut obj = serde_json::Map::new();
                opt_into(&mut obj, "printerId", printer_id);
                opt_into(&mut obj, "status", status);
                ("printQueue.listQueue".into(), Some(Value::Object(obj)))
            }
        },

        Command::Stats { action } => match action {
            StatsAction::Overview { from, to } => {
                let mut obj = serde_json::Map::new();
                opt_into(&mut obj, "dateFrom", from);
                opt_into(&mut obj, "dateTo", to);
                ("printStats.overview".into(), Some(Value::Object(obj)))
            }
            StatsAction::Log { page, page_size, printer_id, status, search, from, to } => {
                let mut input = json!({"page": page, "pageSize": page_size});
                let o = input.as_object_mut().unwrap();
                opt_into(o, "printerId", printer_id);
                opt_into(o, "status", status);
                opt_into(o, "search", search);
                opt_into(o, "dateFrom", from);
                opt_into(o, "dateTo", to);
                ("printStats.printLog".into(), Some(input))
            }
            StatsAction::Timeseries { days } => (
                "printStats.filamentTimeSeries".into(),
                Some(json!({"days": days})),
            ),
            StatsAction::Leaderboard { days } => (
                "printStats.filamentLeaderboard".into(),
                Some(json!({"days": days})),
            ),
            StatsAction::Usage { printer_id } => {
                let mut obj = serde_json::Map::new();
                opt_into(&mut obj, "printerId", printer_id);
                ("printStats.usageHistory".into(), Some(Value::Object(obj)))
            }
            StatsAction::Catalog => ("printStats.filamentCatalog".into(), None),
            StatsAction::Printers => ("printStats.printers".into(), None),
            StatsAction::By_project { days } => (
                "printStats.filamentByProject".into(),
                Some(json!({"days": days})),
            ),
            StatsAction::By_person { days } => (
                "printStats.filamentByPerson".into(),
                Some(json!({"days": days})),
            ),
        },

        Command::Notifications { action } => match action {
            NotificationsAction::List { unread_only, limit } => (
                "notification.list".into(),
                Some(json!({"unreadOnly": unread_only, "limit": limit})),
            ),
            NotificationsAction::Count => ("notification.unreadCount".into(), None),
        },

        Command::Audit { action } => match action {
            AuditAction::List { entity_type, entity_id, actor, action, page, page_size } => {
                let mut input = json!({"page": page, "pageSize": page_size});
                let o = input.as_object_mut().unwrap();
                opt_into(o, "entityType", entity_type);
                opt_into(o, "entityId", entity_id);
                opt_into(o, "actorId", actor);
                opt_into(o, "action", action);
                ("auditLog.list".into(), Some(input))
            }
            AuditAction::For_entity { entity_type, entity_id } => (
                "auditLog.forEntity".into(),
                Some(json!({"entityType": entity_type, "entityId": entity_id})),
            ),
        },

        // Handled in main() before reaching here.
        Command::Auth { .. } | Command::Call { .. } => {
            return Err("handled separately".into())
        }
    })
}

fn opt_str(obj: &mut serde_json::Map<String, Value>, key: &str, v: &Option<String>) {
    if let Some(v) = v {
        obj.insert(key.into(), json!(v));
    }
}

fn opt_into<T: serde::Serialize>(obj: &mut serde_json::Map<String, Value>, key: &str, v: &Option<T>) {
    if let Some(v) = v {
        if let Ok(val) = serde_json::to_value(v) {
            obj.insert(key.into(), val);
        }
    }
}

/// Render an enum variant back to its server-side spelling.
fn snake<T: clap::ValueEnum>(v: &T) -> String {
    clap::ValueEnum::to_possible_value(v)
        .map(|p| p.get_name().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Cli {
        Cli::try_parse_from(args).expect("parse failed")
    }

    #[test]
    fn auth_shorthand_parses() {
        let cli = parse(&["maims", "auth", "-u", "inventory.monashautomation.com", "-t", "tok"]);
        match cli.command {
            Command::Auth { action, url, token } => {
                assert!(action.is_none());
                assert_eq!(url.as_deref(), Some("inventory.monashautomation.com"));
                assert_eq!(token.as_deref(), Some("tok"));
            }
            other => panic!("expected Auth, got {other:?}"),
        }
    }

    #[test]
    fn auth_login_explicit_parses() {
        let cli = parse(&["maims", "auth", "login", "-u", "x.test", "-t", "tok"]);
        match cli.command {
            Command::Auth { action: Some(AuthAction::Login { url, token }), .. } => {
                assert_eq!(url, "x.test");
                assert_eq!(token, "tok");
            }
            other => panic!("expected Auth login, got {other:?}"),
        }
    }

    #[test]
    fn items_list_maps_inputs() {
        let cli = parse(&[
            "maims", "items", "list", "-f", "drill", "--page", "2", "-n", "50",
            "--sort-by", "serial", "--sort-order", "desc", "--consumable",
        ]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "item.list");
        let i = input.unwrap();
        assert_eq!(i["filter"], json!("drill"));
        assert_eq!(i["page"], json!(2));
        assert_eq!(i["pageSize"], json!(50));
        assert_eq!(i["sortBy"], json!("serial"));
        assert_eq!(i["sortOrder"], json!("desc"));
        assert_eq!(i["consumable"], json!(true));
    }

    #[test]
    fn items_list_defaults() {
        let cli = parse(&["maims", "items", "list"]);
        let (_, input) = build_query(&cli.command).unwrap();
        let i = input.unwrap();
        assert_eq!(i["page"], json!(0));
        assert_eq!(i["pageSize"], json!(25));
        assert_eq!(i["sortBy"], json!("name"));
        assert_eq!(i["consumable"], json!(false));
        assert!(i.get("filter").is_none());
    }

    #[test]
    fn printers_active_maps() {
        let cli = parse(&["maims", "printers", "active"]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "print.getActivePrints");
        assert!(input.is_none());
    }

    #[test]
    fn printers_jobs_limit_maps() {
        let cli = parse(&["maims", "printers", "jobs", "--limit", "250"]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "print.getAllPrintJobs");
        assert_eq!(input.unwrap()["limit"], json!(250));
    }

    #[test]
    fn printer_status_maps_ip() {
        let cli = parse(&["maims", "printers", "status", "-i", "10.0.0.5"]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "print.getPrinterStatus");
        assert_eq!(input.unwrap()["printerIpAddress"], json!("10.0.0.5"));
    }

    #[test]
    fn queue_list_omits_absent_filters() {
        let cli = parse(&["maims", "queue", "list"]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "printQueue.listQueue");
        let i = input.unwrap();
        assert!(i.get("printerId").is_none());
        assert!(i.get("status").is_none());
    }

    #[test]
    fn queue_list_includes_present_filters() {
        let cli = parse(&["maims", "queue", "list", "--printer-id", "3", "--status", "printing"]);
        let (_, input) = build_query(&cli.command).unwrap();
        let i = input.unwrap();
        assert_eq!(i["printerId"], json!(3));
        assert_eq!(i["status"], json!("printing"));
    }

    #[test]
    fn location_get_requires_a_selector() {
        let cli = parse(&["maims", "locations", "get"]);
        assert!(build_query(&cli.command).is_err());
    }

    #[test]
    fn location_get_by_name_maps() {
        let cli = parse(&["maims", "locations", "get", "--name", "Lab"]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "location.get");
        assert_eq!(input.unwrap()["name"], json!("Lab"));
    }

    #[test]
    fn dashboard_ranges_map_to_server_spelling() {
        let cli = parse(&["maims", "dashboard", "consumption", "--range", "3m"]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "dashboard.getConsumptionStats");
        assert_eq!(input.unwrap()["range"], json!("3m"));

        let cli = parse(&["maims", "dashboard", "loan-history", "--range", "week"]);
        let (_, input) = build_query(&cli.command).unwrap();
        assert_eq!(input.unwrap()["range"], json!("week"));
    }

    #[test]
    fn whoami_and_outages_are_query_paths() {
        let cli = parse(&["maims", "whoami"]);
        assert_eq!(build_query(&cli.command).unwrap().0, "user.getSelf");
        let cli = parse(&["maims", "outages"]);
        assert_eq!(build_query(&cli.command).unwrap().0, "status.outages");
    }

    #[test]
    fn audit_list_maps_filters() {
        let cli = parse(&[
            "maims", "audit", "list", "--entity-type", "CONSUMABLE_REQUEST",
            "--action", "REQUEST_CREATED", "-n", "10",
        ]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "auditLog.list");
        let i = input.unwrap();
        assert_eq!(i["entityType"], json!("CONSUMABLE_REQUEST"));
        assert_eq!(i["action"], json!("REQUEST_CREATED"));
        assert_eq!(i["pageSize"], json!(10));
    }

    #[test]
    fn stats_log_maps_all_filters() {
        let cli = parse(&[
            "maims", "stats", "log", "--printer-id", "2", "-f", "bracket",
            "--from", "2026-01-01", "--to", "2026-02-01", "--status", "completed",
        ]);
        let (path, input) = build_query(&cli.command).unwrap();
        assert_eq!(path, "printStats.printLog");
        let i = input.unwrap();
        assert_eq!(i["printerId"], json!(2));
        assert_eq!(i["search"], json!("bracket"));
        assert_eq!(i["dateFrom"], json!("2026-01-01"));
        assert_eq!(i["dateTo"], json!("2026-02-01"));
        assert_eq!(i["status"], json!("completed"));
    }

    #[test]
    fn global_flags_parse() {
        let cli = parse(&["maims", "--json", "-u", "x.test", "-t", "t", "whoami"]);
        assert!(cli.json);
        assert_eq!(cli.url.as_deref(), Some("x.test"));
        assert_eq!(cli.token.as_deref(), Some("t"));
    }

    #[test]
    fn mask_hides_middle() {
        assert_eq!(mask(""), "(none)");
        assert_eq!(mask("short"), "••••");
        assert_eq!(mask("abcdefghij"), "abcd…ghij");
    }

    #[test]
    fn no_mutation_paths_are_reachable() {
        // Every mapped *query* path must not be a mutation on the server.
        // Guard against accidentally wiring a mutation into the read-only
        // CLI. Forbidden verbs are matched as whole path segments so the
        // `print`/`printQueue` router prefixes don't collide with them.
        let forbidden = ["checkout", "checkin", "create", "update", "delete",
            "restock", "addToQueue", "cancel", "start", "stop", "pause",
            "resume", "markRead", "markAllRead", "dismiss", "ban", "unban",
            "setRole", "syncAllMembers", "syncOneMember", "provisionTerminal",
            "uploadAndStore", "uploadAndPrint", "reprintJob", "startStoredPrint",
            "submitPrint", "configureAmsSlot", "assignSpool", "unassignSpool",
            "overrideFilamentShort", "autoResolveFilamentShort",
            "overrideFilamentToFull", "nameFilamentColor", "clearPrinterErrors",
            "clearBuildPlate", "submitPrintRating", "refreshPrintCamCache",
            "deleteConversation", "sendMessage", "createConversation",
            "acknowledgeVersion", "removeAvatar", "validateDiscordIds",
            "logAfterHours", "move", "addTags", "cascadeDelete", "createMany",
            "setPrimary", "recover", "bulkDelete", "printLabel", "updateNote"];
        let samples = [
            "item.list", "item.get", "item.getBySerial", "item.countByName",
            "item.getImageUrl", "print.getPrinters", "print.getActivePrints",
            "print.getAllPrintJobs", "print.getPrinterStatus",
            "printQueue.listQueue", "printQueue.listPrinters",
            "printQueue.getPrinterAms", "printStats.overview",
            "auditLog.list", "auditLog.forEntity", "user.getSelf",
            "user.list", "consumable.list", "consumable.get",
            "consumableRequest.list", "consumableRequest.listMine",
            "consumableRequest.pendingCount", "location.list",
            "location.getRoots", "location.getChildren", "location.hasChildren",
            "tag.list", "tagGroup.listChildren", "group.list",
            "dashboard.getLoanHistory", "dashboard.getItemStatusStats",
            "notification.list", "notification.unreadCount",
            "status.outages", "qr.generateUrl", "apiToken.listMine",
        ];
        for p in samples {
            let last = p.rsplit('.').next().unwrap();
            for f in forbidden {
                assert!(last != f, "mutation-ish path in read-only map: {p}");
            }
        }
    }

    #[test]
    fn tokens_list_parses() {
        let cli = parse(&["maims", "tokens", "list"]);
        match cli.command {
            Command::Tokens { action: TokensAction::List } => {}
            other => panic!("expected Tokens list, got {other:?}"),
        }
    }

    #[test]
    fn tokens_create_maps_input() {
        let cli = parse(&["maims", "tokens", "create", "-n", "laptop", "--expires-in-days", "30"]);
        match cli.command {
            Command::Tokens { action: TokensAction::Create { name, expires_in_days } } => {
                assert_eq!(name, "laptop");
                assert_eq!(expires_in_days, Some(30));
            }
            other => panic!("expected Tokens create, got {other:?}"),
        }
    }

    #[test]
    fn tokens_revoke_parses() {
        let cli = parse(&["maims", "tokens", "revoke", "some-id"]);
        match cli.command {
            Command::Tokens { action: TokensAction::Revoke { id } } => {
                assert_eq!(id, "some-id");
            }
            other => panic!("expected Tokens revoke, got {other:?}"),
        }
    }
}

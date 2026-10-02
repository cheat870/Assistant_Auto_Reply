# 🛡️ Telegram Auto Reply + File Security Analysis + Manual Admin Review Bot

A production-ready Telegram bot engineered with **grammY**, **TypeScript (Strict Mode)**, **PostgreSQL (Prisma ORM)**, and **Redis**.

The system integrates two core engines:
1. **🤖 Chat Automation Engine:** Flexible keyword-driven auto-reply system with priority resolution, exact/substring/prefix matching, and per-chat or global settings.
2. **🛡️ File Security Analysis Engine:** Safe, non-destructive static analysis for suspicious files (`.exe`, `.bat`, `.cmd`, `.ps1`, `.vbs`, `.js`, `.z`, `.zip`, `.tar`, `.gz`, `.rar`, `.7z`), double extension deception detection (`invoice.pdf.exe`), SHA-256 hash generation, and administrative moderation.

> [!IMPORTANT]
> **Strict Non-Destructive Moderation Policy:**
> By design, the bot **NEVER automatically deletes files, bans users, or mutes users**. All suspicious files remain intact in the chat while an objective risk assessment and potential impact report is generated and queued for authorized administrator review (`DELETE`, `ALLOW`, or `IGNORE`).

---

## 📋 Table of Contents
1. [Architecture & Features](#-architecture--features)
2. [Technology Stack](#-technology-stack)
3. [Prerequisites](#-prerequisites)
4. [Telegram Bot & BotFather Setup](#-telegram-bot--botfather-setup)
5. [Configuration & Environment Variables](#-configuration--environment-variables)
6. [Local Development Setup](#-local-development-setup)
7. [Database Migrations with Prisma](#-database-migrations-with-prisma)
8. [Docker & Containerized Deployment](#-docker--containerized-deployment)
9. [Linux / VPS Production Deployment](#-linux--vps-production-deployment)
10. [Bot Operation & Moderation Workflow](#-bot-operation--moderation-workflow)
11. [Command Reference](#-command-reference)
12. [Testing & Quality Assurance](#-testing--quality-assurance)
13. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🏛 Architecture & Features

```
USER SENDS FILE
       │
       ▼
BOT DETECTS FILE (Extension / Magic Bytes)
       │
       ▼
SAFE ISOLATED DOWNLOAD (UUID sandbox in /tmp)
       │
       ▼
STATIC ANALYSIS (PE Headers / Scripts / Archive Central Directory)
       │
       ▼
CALCULATE SHA-256 & RISK LEVEL (LOW / MEDIUM / HIGH / CRITICAL)
       │
       ▼
USER ALERT POSTED (Explains potential impact without false malware claims)
       │
       ▼
ADMIN NOTIFIED WITH INLINE BUTTONS (Status: PENDING REVIEW)
       │
       ▼
ADMIN DECIDES:
 ├── [🗑 DELETE] ──► Deletes message via Telegram API, records audit log
 ├── [✅ ALLOW]  ──► Retains message, sets status APPROVED, records audit log
 └── [❌ IGNORE] ──► Retains message, sets status IGNORED, records audit log
```

### Key Capabilities
* **Pure Static Analysis:** Files are **never executed**, scripts are never run, and binaries are never loaded into memory.
* **PE Header Parsing:** Native TypeScript parser extracts PE32/PE32+ headers, Machine architecture (x86, x64, ARM), entry points, section entropy (for packing detection), and Authenticode digital signature presence.
* **Script Static Inspection:** Regex & token detection for PowerShell invocations, execution policy bypass, base64 encoded commands, volume shadow copy deletion, silent file deletion, registry persistence, and network downloaders.
* **Archive Inspection:** Pure central directory reading for `.zip` (via `yauzl`), `.tar`, and `.gz`. Detects nested executables, path traversal (`../`), and suspected zip bombs without extracting files to disk.
* **Double Extension Deception Detection:** Flags deceptive naming techniques like `invoice.pdf.exe`, `photo.jpg.exe`, or `document.docx.bat`.
* **Zero False Malware Claims:** Objectively describes observed technical indicators and potential operating system impact without claiming unverified malware infection.
* **Atomic Race-Condition Protection:** Database-level atomic state transitions ensure that concurrent admin actions cannot result in duplicate executions.
* **Redis Rate Limiting:** Sliding-window rate limiting per-user and per-chat with automatic memory fallback.
* **Comprehensive Audit Trail:** Immutable logging of all security events, file detections, and admin moderation decisions.

---

## 🛠 Technology Stack

* **Runtime:** Node.js 22+ (ES Modules)
* **Language:** TypeScript 5.7+ (Strict Mode, `noImplicitAny`, `noUncheckedIndexedAccess`)
* **Bot Framework:** [grammY](https://grammy.dev/) + `@grammyjs/runner`
* **Database ORM:** [Prisma ORM](https://www.prisma.io/) with PostgreSQL 16+
* **Caching & Rate Limiting:** Redis 7+ via `ioredis`
* **Validation:** [Zod](https://zod.dev/)
* **Logging:** [Pino](https://getpino.io/) structured JSON logger with `pino-pretty`
* **Testing:** [Vitest](https://vitest.dev/)
* **Code Quality:** ESLint & Prettier
* **Containerization:** Docker & Docker Compose

---

## 📦 Prerequisites

* **Node.js:** v22.0.0 or higher
* **npm:** v10.0.0 or higher
* **PostgreSQL:** v15 or higher (or Docker)
* **Redis:** v7 or higher (or Docker)
* **Telegram Account:** To create and test the bot

---

## 🤖 Telegram Bot & BotFather Setup

1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts to choose a display name and username.
3. Save the returned **API Token** (format: `123456789:ABCdefGHI...`).
4. **Group Privacy Settings:**
   * In `@BotFather`, send `/setprivacy`.
   * Select your bot and choose **Disable** (this allows the bot to inspect messages and files in group chats).
5. **Channel & Group Admin Permissions:**
   * When adding the bot to a group or supergroup, grant the following permissions:
     * *Delete Messages* (Required for the `[🗑 DELETE]` button to function).
     * *Send Messages* (Required for alerts and auto-replies).

---

## ⚙️ Configuration & Environment Variables

Copy the provided `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure the following variables in `.env`:

```env
# Application Environment
NODE_ENV=development

# Telegram Bot Token from @BotFather
BOT_TOKEN=8985916228:AAH0jGdk2nsUnDk17n-tFpBcngQM8-xUrXU

# PostgreSQL Database Connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/telegram_security_bot?schema=public

# Redis Connection
REDIS_URL=redis://localhost:6379

# Authorized Administrator Telegram IDs (comma-separated numeric IDs)
ADMIN_IDS=1667275809

# Bot Operating Mode: "polling" or "webhook"
BOT_MODE=polling

# Webhook Configuration (only used if BOT_MODE=webhook)
WEBHOOK_URL=https://your-domain.com/telegram/webhook
WEBHOOK_SECRET=your_custom_webhook_secret_key
PORT=3000

# File Security & Analysis Constraints
MAX_FILE_SIZE_MB=50
MAX_ARCHIVE_ENTRIES=1000
MAX_ARCHIVE_EXTRACTED_SIZE_MB=200
FILE_SCAN_TIMEOUT_SECONDS=30

# Feature Flags
AUTO_REPLY_ENABLED=true
FILE_PROTECTION_ENABLED=true
ARCHIVE_SCANNING_ENABLED=true
ADMIN_NOTIFICATIONS_ENABLED=true

# Mandatory Safety Rules (DO NOT SET TO TRUE)
AUTO_DELETE=false
AUTO_BAN=false
AUTO_KICK=false
AUTO_MUTE=false
AUTO_RESTRICT=false
ADMIN_APPROVAL_REQUIRED=true

# Rate Limiting
RATE_LIMIT_USER_MESSAGES=10
RATE_LIMIT_WINDOW_SECONDS=10
```

> [!TIP]
> To find your numeric Telegram User ID for `ADMIN_IDS`, send a message to [@userinfobot](https://t.me/userinfobot) or [@raw_data_bot](https://t.me/raw_data_bot).

---

## 💻 Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Prisma Client
```bash
npx prisma generate
```

### 3. Run Database Migrations
If using a local PostgreSQL instance:
```bash
npx prisma migrate dev --name init
```

### 4. Start the Application in Watch Mode
```bash
npm run dev
```

The application will initialize the database connection, seed default blocked extensions (`.exe`, `.bat`, `.cmd`, `.zip`, etc.), start the HTTP server on port 3000, and launch the Telegram polling runner.

---

## 🐳 Docker & Containerized Deployment

The project includes an optimized multi-stage `Dockerfile` and `docker-compose.yml` with health checks and isolated networking.

### Run with Docker Compose
```bash
# 1. Ensure your .env file is configured
# 2. Build and start containers in the background
docker compose up -d --build
```

### Verify Running Services
```bash
docker compose ps
```

### View Live Logs
```bash
docker compose logs -f bot
```

### Stop Services
```bash
docker compose down
```

---

## 🚀 Linux / VPS Production Deployment

For deploying on a Linux VPS (Ubuntu/Debian):

### 1. Clone & Setup Permissions
```bash
git clone https://github.com/your-username/telegram-security-bot.git /opt/telegram-security-bot
cd /opt/telegram-security-bot
cp .env.example .env
nano .env # Configure BOT_TOKEN, ADMIN_IDS, and DATABASE_URL
```

### 2. Option A: Run via Docker Compose (Recommended)
```bash
docker compose up -d --build
```

### 3. Option B: Run via systemd + Node.js
If running directly on the VPS host:
```bash
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
npm run build
```

Create a systemd service `/etc/systemd/system/tg-bot.service`:
```ini
[Unit]
Description=Telegram Security & Auto Reply Bot
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/telegram-security-bot
ExecStart=/usr/bin/node /opt/telegram-security-bot/dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/telegram-security-bot/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tg-bot
sudo systemctl status tg-bot
```

---

## 🛡️ File Analysis & Moderation Workflow

### 1. User Uploads a File
When a user uploads a file with a suspicious extension (e.g. `setup.exe` or `invoice.pdf.exe`):
1. The bot inspects Telegram metadata, normalizes the filename, and determines risk criteria.
2. The file is streamed to a private, randomized sandbox in `/tmp/tg-bot-security-scans`.
3. The SHA-256 hash is computed.
4. Magic bytes and file headers are analyzed (PE32/PE32+ architecture, digital signature table, section entropy).
5. The temporary file is **immediately deleted**.
6. The event is recorded in PostgreSQL with status `PENDING`.
7. **The user's original message remains completely untouched.**

### 2. User-Facing Response
The bot replies to the user's message in the chat:
```
⚠️ FILE SECURITY ALERT

📄 File:
setup.exe

🔒 Type:
Windows Executable

⚠️ Risk:
🔴 HIGH

💥 Potential Impact:
• Can execute native binary machine code on Windows
• Can launch additional processes
• Can create, modify, or delete files
• Can communicate with external services if network code is included

🔍 Analysis:
• PE executable detected
• Unsigned executable

🔐 SHA-256:
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

⚠️ This analysis describes potential capabilities and detected indicators. It does NOT prove that this specific file is malicious.

🛡️ Status:
Waiting for administrator review.
The file has NOT been automatically deleted.
```

### 3. Admin Notification & Review Buttons
Administrators configured in `ADMIN_IDS` receive a private notification with an interactive inline keyboard:
```
🚨 DETAILED FILE SECURITY ANALYSIS

👤 User: @johndoe
🆔 User ID: 123456789
💬 Chat: Production Group

📄 Filename: setup.exe
🔒 Extension: .exe
📦 Size: 12.40 MB
🧬 File Type: PE32+ executable
💻 Architecture: x64
🔏 Digital Signature: Not detected
🔐 SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

⚠️ Risk: 🔴 HIGH

🔍 Indicators:
• Executable file
• PE format
• Unsigned

💥 Potential Impact:
• Code execution
• Process execution
• File modification

🛡️ Scanner: NOT CONFIGURED

⏳ Status: PENDING REVIEW

[🗑 DELETE]   [✅ ALLOW]   [❌ IGNORE]
```

* **[🗑 DELETE]:** Deletes the user's original message in the chat, updates database status to `DELETED`, and logs the action to `AuditLog`.
* **[✅ ALLOW]:** Retains the message, updates status to `APPROVED`, and writes to `AuditLog`.
* **[❌ IGNORE]:** Retains the message, updates status to `IGNORED`, and writes to `AuditLog`.

---

## 💬 Command Reference

### Public Commands
| Command | Description |
|---|---|
| `/start` | Initializes the bot and displays welcome information (Khmer / English) |
| `/help` | Displays help instructions and security policy |
| `/menu` | Alias for help guidance |
| `/lang` | Changes bot language (`🇰🇭 ភាសាខ្មែរ` / `🇬🇧 English`) |

### Administrator Commands (Restricted to `ADMIN_IDS`)
| Command | Description |
|---|---|
| `/admin` | Opens the interactive visual Admin Panel (Localized) |
| `/stats` | Shows real-time statistics (users, files scanned, reviews, auto-replies) |
| `/pending` | Displays queue of files awaiting administrator review |
| `/settings` | Displays active system and chat moderation flags |
| `/logs` | Lists recent audit log records |
| `/keywords` | Lists all configured auto-reply keywords |
| `/addkeyword <kw> \| <reply> \| [matchType] \| [priority]` | Adds a new auto-reply rule |
| `/delkeyword <id>` | Deletes an auto-reply keyword by ID |
| `/blocked` | Lists all monitored file extensions |
| `/addblocked <.ext> [description]` | Adds an extension to the security inspection policy |
| `/delblocked <.ext>` | Removes an extension from the policy |

#### Keyword Examples
```bash
# Add a contains match keyword (English)
/addkeyword hello | 👋 Hello! How can I assist you today?

# Add Khmer keyword (ភាសាខ្មែរ)
/addkeyword សួស្តី | 👋 សួស្តី! តើខ្ញុំអាចជួយអ្វីអ្នកបានទេថ្ងៃនេះ?
/addkeyword តម្លៃ | 💰 សូមផ្ញើឈ្មោះ ឬព័ត៌មានលម្អិតនៃផលិតផលមក ខ្ញុំនឹងជួយពិនិត្យតម្លៃជូន។
/addkeyword ជំនួយ | 📖 វាយពាក្យ /help ដើម្បីមើលបញ្ជីពាក្យបញ្ជា ឬ /admin សម្រាប់ផ្ទាំងគ្រប់គ្រង។

# Add an exact match keyword with custom priority
/addkeyword pricing | 💰 Please visit our pricing page at https://example.com/pricing | EXACT | 20

# Add a prefix match keyword
/addkeyword order status | 📦 Please enter your tracking number to check your status. | STARTS_WITH | 15
```

---

## 🧪 Testing & Quality Assurance

The codebase includes an extensive automated test suite covering:
* Extension normalization and case insensitivity (`.EXE`, `.bat`, `.ZIP`, `.7z`)
* Double extension deception (`invoice.pdf.exe`, `photo.jpg.exe`, `document.docx.bat`)
* Legitimate compound extensions (`archive.tar.gz`)
* PE static binary parsing (DOS headers, PE32+, x64 architecture, section entropy)
* Script static analysis (PowerShell bypass, encoded commands, shadow copy deletion)
* Archive central directory inspection (ZIP bomb detection, path traversal protection, executable detection)
* Moderation state transitions (atomic approvals, double-action prevention)
* Telegram API permission error handling
* Redis sliding-window rate limiting

Run tests:
```bash
npm test
```

Run TypeScript build validation:
```bash
npm run build
```

Format codebase with Prettier:
```bash
npm run format
```

Run linter:
```bash
npm run lint
```

---

## ❓ Troubleshooting & FAQ

#### 1. Why does the bot say "Unable to delete message" when I click [🗑 DELETE]?
The bot must be an **Administrator** in the group chat with the **"Delete Messages"** permission enabled. If the message is older than 48 hours, Telegram also restricts message deletion.

#### 2. The bot is not receiving messages in a group chat.
In [@BotFather](https://t.me/BotFather), make sure you have sent `/setprivacy`, selected your bot, and set it to **Disable**. Then remove and re-add the bot to your group chat.

#### 3. Admins did not receive private alerts when a suspicious file was sent.
Administrators listed in `ADMIN_IDS` must send `/start` to the bot in a private chat at least once so the bot has permission to initiate a direct message.

#### 4. Can the bot automatically delete files?
No. By architectural design and safety requirements, `AUTO_DELETE` is strictly disabled. Only an authorized administrator pressing the `[🗑 DELETE]` button can delete a file.

---

## 📄 License
This project is licensed under the MIT License.

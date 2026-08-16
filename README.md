# ☁️ CloudBridge

**CloudBridge** is a full-stack cloud-to-cloud file migration platform that enables secure file transfers between cloud storage providers without requiring users to manually download and re-upload files.

## 🌐 Live Demo

🚀 **Application:** https://cloudbridge-production.up.railway.app/

Currently supported providers:
- ✅ Google Drive
- ✅ MEGA

---

## ✨ Features

- 🔐 Secure Google OAuth 2.0 authentication
- ☁️ Connect multiple cloud storage providers
- 📂 Migrate files between cloud platforms
- 📊 Real-time migration progress tracking
- 📝 Live activity logs
- 🔄 Duplicate handling options
  - Skip
  - Rename
  - Overwrite
- 🔁 Automatic retry mechanism for transient failures
- 📄 Google Drive pagination support for large folders
- 🚀 Responsive React frontend
- 🌐 Production backend deployed on Oracle Cloud Infrastructure (OCI)

---

## 🏗️ Architecture

```
               +------------------+
               |   React Frontend |
               |      (Vercel)    |
               +--------+---------+
                        |
                        |
                 REST API Requests
                        |
                        ▼
          +---------------------------+
          |  Express Backend (Node.js)|
          |   Oracle Cloud VM (PM2)   |
          +-------------+-------------+
                        |
        +---------------+---------------+
        |                               |
        ▼                               ▼
 Google Drive API                 MEGA SDK/API
```

---

## 🛠 Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Node.js
- Express.js
- TypeScript

### Cloud & Deployment

- Oracle Cloud Infrastructure (OCI)
- Linux
- PM2
- Vercel

### APIs

- Google Drive API
- Google OAuth 2.0
- MEGA SDK

---

## 🚀 How It Works

1. Connect your cloud accounts.
2. Select the source provider.
3. Select the destination provider.
4. Choose duplicate handling behavior.
5. Start migration.
6. Monitor transfer progress in real time.

---

## 📌 Key Engineering Concepts

This project demonstrates practical experience with:

- OAuth 2.0 Authentication
- REST API Development
- Third-party API Integration
- Asynchronous Programming
- Background Job Processing
- Polling
- Retry Logic
- Pagination
- State Synchronization
- Cloud Deployment
- Production Debugging

---

## ⚠ Current Limitations

- Migration jobs are stored in memory and cannot be resumed if the server restarts.
- Currently supports Google Drive and MEGA only.
- Folder synchronization and scheduled migrations are not yet implemented.

---

## 📈 Project Highlights

- Secure OAuth-based authentication
- End-to-end cloud file migration
- Production deployment on Oracle Cloud Infrastructure
- Real-time migration monitoring
- Duplicate conflict resolution
- Fault-tolerant retry mechanism
- Scalable architecture for adding additional cloud providers

---


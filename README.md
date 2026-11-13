# ✦ Your-Agent

**Your-Agent** is a small, full-stack AI productivity workspace: an assistant that helps you plan your day, suggests task changes for your approval, and keeps your tasks and notes organized.

![Status](https://img.shields.io/badge/status-MVP-7c6cff) ![Node](https://img.shields.io/badge/Node.js-22%2B-2eae81) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **AI assistant:** Chat with a real OpenAI model using a backend proxy (your API key is never sent to the browser).
- **Task-aware planning:** Ask the assistant to create, complete, reopen, or delete tasks. It proposes actions that **you must approve** before they change your data.
- **Personal dashboard:** Track open tasks, completed tasks, high-priority items, and daily focus.
- **Task board:** Create, complete, filter, and delete tasks, with priorities and optional due dates.
- **Notes:** Create, edit, and delete personal notes.
- **Privacy-first local workspace:** Tasks, notes, and chat history are stored in your own browser's localStorage; there is no database, account, or cloud synchronization.
- **Responsive interface:** Works on desktop and mobile.

## Run locally

**Requirements:** Node.js 22 or newer; an OpenAI API key if you want AI chat.

```bash
git clone https://github.com/ikramsalhi/Your-Agent.git
cd Your-Agent
cp .env.example .env
```

Edit `.env` and set your own `OPENAI_API_KEY`. If needed, change `OPENAI_MODEL` to a compatible model with Structured Outputs support.

```bash
npm start
```

Open **http://localhost:3000**. No `npm install` is required because the application has zero third-party dependencies. Task and note features work even without an API key; the AI chat needs one.

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

For local development:

```bash
npm run dev
npm test
```

## Security & privacy

- **Do not commit `.env`**, secrets, or API tokens. `.env` is excluded by `.gitignore`.
- The browser sends current tasks and notes plus chat content to the local Node server **when you ask the AI a question**; the server sends those details to the configured OpenAI API for response generation.
- Chat history, tasks, and notes persist in that browser only. Clearing its storage removes them. These are not backed up or synced.
- The model **cannot directly execute actions**. It may only suggest changes to your local task list, and you must click *Apply*.
- This is a personal prototype, **not a hardened public multi-user service**. Before deploying to the open internet, add authentication, per-user storage, server-side quotas, and additional abuse protections. Without authentication, anyone who can access your deployed server can spend your API quota.

## Project layout

```text
Your-Agent/
├── public/
│   ├── index.html       # Interface
│   ├── styles.css       # Design system and responsive layout
│   ├── app.js           # Client-side state, tasks, notes, chat
│   └── favicon.svg
├── server/
│   ├── index.js         # HTTP server / secure AI proxy
│   └── lib.js           # Validation and agent response schema
├── test/
│   └── lib.test.js      # Unit tests
├── .env.example         # Example configuration (safe to commit)
├── .gitignore
└── package.json
```

## Roadmap

- User authentication and optional encrypted sync
- Calendar integration with permission-based actions
- Export / import of tasks and notes
- Streaming AI responses and multiple conversations

Made to help you turn ideas into action. ✨

# Vireon AI - Frontend

React + Ant Design frontend for the Vireon AI video generation platform.

## Tech Stack

- **Framework:** React 19
- **UI Library:** Ant Design 6
- **Routing:** React Router 7
- **HTTP Client:** Axios
- **Realtime:** Socket.IO Client
- **Build Tool:** Vite

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Job stats, recent jobs table, real-time updates |
| `/wizard` | Create Video | 3-step form: topic/type → voice → resolution |
| `/render?id=` | Render Progress | Real-time progress, pipeline steps, video download |
| `/projects` | Projects | Placeholder |
| `/editor/complete` | Complete | Placeholder |
| `/analytics` | Analytics | Placeholder |
| `/settings` | Settings | Placeholder |

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

## Environment

Create `.env` in frontend root (optional):

```
VITE_API_URL=http://localhost:3000

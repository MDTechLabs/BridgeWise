# Contributing to BridgeWise

First off, thank you for your interest in contributing to BridgeWise 🚀
This project is actively evolving, and we welcome high-quality contributions that improve stability, scalability, and developer experience..

---
<!-- ## Stellar/Soroban Features - All Issues Implemented -->
## 🧭 Project Structure

This repository follows a **monorepo architecture**:

```
apps/
  api/        # Backend (NestJS)
  web/        # Frontend (React)

packages/
  ui/         # Shared UI components
  utils/      # Shared utilities
  types/      # Shared TypeScript types
```

---

## ⚠️ Core Rules (Non-Negotiable)

### 1. Separation of Concerns

* ❌ Do NOT mix frontend and backend code
* ❌ No `.tsx` files inside backend (`apps/api`)
* ❌ No backend logic inside frontend

### 2. Build Must Pass

* Every PR **must compile successfully**
* Run before submitting:

  ```bash
  pnpm install
  pnpm build
  ```

### 3. No Broken Imports

* ❌ Do NOT introduce unresolved imports
* ❌ Avoid invalid aliases like `@/...` unless properly configured
* ✅ Use relative paths or configured aliases only

### 4. No Incomplete Features

* ❌ Do NOT submit partially implemented modules
* ✅ If a feature is incomplete, isolate it or mark clearly

---

## 🛠️ Development Setup

### Install dependencies

```bash
pnpm install
```

### Run apps

```bash
# Backend
pnpm --filter @bridgewise/api start:dev

# Frontend
pnpm --filter web dev
```

### Build all

```bash
pnpm build
```

---

## 📦 Working with the Monorepo

### Add a dependency to a specific app

```bash
pnpm add <package> --filter web
pnpm add <package> --filter @bridgewise/api
```

### Add a shared package

```bash
packages/<your-package>/
```

---

## 🧪 Code Quality

### Linting & Formatting

* Follow ESLint and Prettier rules
* Keep code clean and readable

### Type Safety

* Use strict TypeScript practices
* Avoid `any` unless absolutely necessary

---

## 🔀 Pull Request Process

### Before submitting a PR:

* [ ] Code compiles without errors
* [ ] No TypeScript errors
* [ ] No unused imports or variables
* [ ] Scope matches the issue

### PR must include:

* Clear description of changes
* Reference to related issue (if any)
* Screenshots (for UI changes)

---

## 🚫 What Will Be Rejected

PRs will be rejected if they:

* Break the build
* Introduce architectural violations
* Contain incomplete or experimental code
* Lack proper description or context

---

## 🧩 Contribution Areas

We welcome contributions in:

* Architecture improvements
* Bug fixes
* Performance optimizations
* Developer experience (DX)
* Documentation

---

## 🏷️ Issue Guidelines

Before starting work:

* Check if an issue already exists
* Comment on the issue to get assigned
* Follow the issue scope strictly

---

## 🛡️ Maintainer Notes

This project prioritizes:

* Stability over speed
* Clean architecture over quick fixes
* Long-term scalability

---

## 🙌 Final Note

High-quality contributions are highly valued.
If you're unsure about anything, open a discussion or ask for clarification before implementing.

Let’s build something solid together.

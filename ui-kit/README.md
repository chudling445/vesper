# Vesper UI Kit / Kokonut UI extension workspace

This folder is an optional React/Tailwind component workspace for adding Kokonut UI components without changing the working plain-local Vesper runtime.

## Quick start

Install [Bun](https://bun.sh) first, then run from this folder:

```powershell
bunx --bun shadcn@latest init
```

When the CLI asks for a framework, use a React/Tailwind project configuration. Then add a Kokonut component with the registry URL or namespace documented by [Kokonut UI](https://kokonutui.com/docs):

```powershell
bunx --bun shadcn@latest add @kokonutui/<component-name>
```

Vesper itself remains plain HTML/JavaScript so the Windows desktop launcher does not require Bun, npm, React, or Tailwind. Use this workspace when you want to prototype reusable cards, dialogs, command menus, or animated UI surfaces before porting the final markup into `styles.css` and the existing pages.

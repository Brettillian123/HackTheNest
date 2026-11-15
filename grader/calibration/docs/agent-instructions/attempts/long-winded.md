# Trailpost

Trailpost is a small static website of hiking trail notes, built with Vite and TypeScript. This document contains the instructions that an AI coding agent should follow when working in this repository. It is important to note that these instructions should be followed carefully at all times.

## Overview

This section describes the overview of the project. Trailpost is a website. It is a static website, which means that there is no backend server and there is no database. All of the pages in Trailpost are written as TypeScript modules, and these TypeScript modules render HTML at build time. As mentioned above, there is no backend. The trail data that the website shows is kept in a JSON file in `src/data/trails.json`. It is important to note that there is no database at all. Always run the tests before you finish any piece of work. The site is deployed automatically by the continuous integration system, so you never need to deploy anything by hand yourself.

## Setup

This section covers setup. Before you do anything else, you will need to make sure that you have the right version of Node installed on your computer. The right version of Node for this project is Node 20, which is the version that the project uses. Once you have Node 20 installed, you can install all of the dependencies of the project. To install the dependencies, please note that you should use the lockfile, which means you should run the following command:

```bash
npm ci
```

Always run the tests before you finish any piece of work.

## Commands

This section lists the commands. There are several commands that you will use while working on Trailpost. Each command is listed below together with an explanation of what the command does when you run it.

- `npm run dev` starts the development server, which you can then open in your web browser on port 5173 so that you can see the site while you work on it.
- `npm test` runs all of the unit tests one time, using the Vitest test runner, and reports which tests passed and which tests failed.
- `npm run lint` runs ESLint and also runs the TypeScript type checker, and reports any problems that they find in the code.
- `npm run build` builds the whole site for production and writes the output into the `dist/` folder.

Always run the tests before you finish any piece of work.

## Project layout

This section explains the project layout. The project is laid out in a number of folders, and each folder has its own purpose, as explained in the list below.

- `src/pages/` contains the pages of the site, with one file for each page, and the name of the file is used as the URL of the page.
- `src/components/` contains the shared components, such as the header component and the trail card component, which are used by more than one page.
- `src/data/` contains the trail data, stored as JSON.
- `tests/` contains the unit tests, and each test file is named after the file that it tests.

## Rules

This section lists the rules. There are a number of rules that you must always follow when you are working in this repository. Please read them carefully.

- Never edit any of the files in the `dist/` folder, because those files are generated automatically by the build and any changes that you make to them will be lost.
- Always ask before you add a new dependency to the project, and explain why the dependency is needed.
- Never commit the `.env` file, and never print the contents of the `.env` file.
- Keep each of your changes small, with one feature or one fix in each change.
- Always run the tests before you finish any piece of work.

## Testing

This section covers testing. Testing is very important in this project. Before you say that any change is finished, you must do the following things:

1. Run `npm test` and make sure that every single test passes.
2. Run `npm run lint` and fix every error that it reports.
3. If you have changed a page, run `npm run dev` and look at the page in your browser.

In conclusion, always run the tests before you finish any piece of work.

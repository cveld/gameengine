# Gameengine

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 12.1.4.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

Use `npm run build` for publishable builds: its `postbuild` hook stamps the
checkout's commit into the website footer and Orbit footer. The full hash is
available as a tooltip; local pending changes are labeled explicitly. Direct
`ng build` skips this hook, so follow it with `node scripts/stamp-build.cjs`.
Source/dev-server pages show `Commit: development`, not a fabricated commit.
CI prepares ignored `.build-commit.json` metadata before the hosted build so
stamping still works when the build container does not retain `.git`.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

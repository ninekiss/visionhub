# Shared UI and Tailwind conventions

VisionHub's shared React primitives are provided by `@visionhub/ui`. They are source-first so Web can consume them without a separate package build; the package remains framework-light and does not own whole pages.

## Tokens

Import `@visionhub/ui/tokens.css` in the client entry point. Use the semantic CSS variables for shared colors and radius values: `--vh-bg`, `--vh-panel`, `--vh-line`, `--vh-text`, `--vh-muted`, `--vh-accent`, and status tokens.

## Primitives

- `Button`: primary, secondary and ghost variants with keyboard focus and disabled states. Existing admin call sites may continue to use the `kind` prop during migration.
- `Field`: consistent field labels and layout; feature-specific inputs can keep specialized styling until migrated.
- `Message`: accessible error/success/info feedback, using alert/status roles.
- `Badge`: compact neutral, accent, success, danger and series variants.
- `Panel`: shared panel surface and border convention.
- `NavigationItem`: accessible route link with active state; the host client supplies navigation behavior.
- `SearchField` and `SelectControl`: consistent catalog filters with native input/select semantics.
- `TextInput` and `TextAreaControl`: shared form-control focus, border, spacing and text styles.
- `ChoiceChip`: selected/unselected category chips.
- `DataTable`, `TableContainer`, `TableHeaderCell`, `TableRow` and `TableCell`: shared table structure and responsive cell spacing.
- `IconButton` and `PaginationBar`: compact table actions and pagination surface.

Import primitives from `@visionhub/ui`. Avoid copying component implementations into Web or future Electron code.

## Tailwind source discovery

The Web Tailwind CSS v4 entry explicitly scans `packages/ui/src`, so utility classes defined by shared TSX components are emitted in the Web bundle. New shared components should use static utility strings or clearly defined variant maps; avoid constructing arbitrary class names dynamically.

## Migration scope

Phase 3 deliberately migrates in slices. The admin navigation, catalog search/filter controls, catalog table and pagination, basic form controls and category chips now use shared primitives. Page grids, data-specific content layout, a few specialized controls and custom Plyr styling remain in feature CSS until each section can be migrated and verified without changing behavior.

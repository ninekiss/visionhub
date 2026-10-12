# Shared UI and Tailwind conventions

VisionHub's shared React primitives are provided by `@visionhub/ui`. They are source-first so Web can consume them without a separate package build; the package remains framework-light and does not own whole pages.

## Tokens

Import `@visionhub/ui/tokens.css` in the client entry point. Use the semantic CSS variables for shared colors and radius values: `--vh-bg`, `--vh-panel`, `--vh-line`, `--vh-text`, `--vh-muted`, `--vh-accent`, and status tokens.

## Primitives

- `Button`: primary, secondary, ghost, surface, hero-primary and hero-secondary variants with default/compact/hero sizing, keyboard focus and disabled states. Existing admin call sites retain the `kind` prop and default size.
- `Field`: consistent field labels and layout; feature-specific inputs can keep specialized styling until migrated.
- `Message`: accessible error/success/info feedback, using alert/status roles.
- `Badge`: compact neutral, accent, success, danger and series variants.
- `Panel`: shared panel surface and border convention.
- `NavigationItem`: accessible route link with active state; the host client supplies navigation behavior. Sidebar and top-navigation variants share route semantics but retain different visual layouts.
- `SearchField` and `SelectControl`: consistent catalog filters with native input/select semantics. `SearchField` includes an admin form variant and a public header variant, while responsive conceal/show behavior remains owned by the page.
- `TextInput` and `TextAreaControl`: shared form-control focus, border, spacing and text styles.
- `ChoiceChip`: selected/unselected category chips with standard compact and pill variants.
- `DataTable`, `TableContainer`, `TableHeaderCell`, `TableRow` and `TableCell`: shared table structure and responsive cell spacing.
- `IconButton` and `PaginationBar`: compact table actions and pagination surface.

Import primitives from `@visionhub/ui`. Avoid copying component implementations into Web or future Electron code.

## Tailwind source discovery

The Web Tailwind CSS v4 entry explicitly scans `packages/ui/src`, so utility classes defined by shared TSX components are emitted in the Web bundle. New shared components should use static utility strings or clearly defined variant maps; avoid constructing arbitrary class names dynamically.

## Migration scope

Phase 3 deliberately migrates in slices. The admin navigation, catalog search/filter controls, catalog table and pagination, basic form controls and category chips use shared primitives. The public Web catalog category filters and pagination buttons use the same package with their own pill/compact variants; top navigation, search input and Hero CTA buttons also use shared components. The logo, notification icon, avatar, Hero layout and Plyr-specific styling remain feature-specific. Public catalog cards now use Tailwind utilities for layout, metadata and hover behavior; only the poster gradient pseudo-element remains in custom CSS. Page grids, data-specific content layout, a few specialized controls and custom Plyr styling remain in feature CSS until each section can be migrated and verified without changing behavior.

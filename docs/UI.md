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
- `MediaCard`: shared public catalog card for the main list and related-content sections, including poster, metadata, optional rank and hover play affordance.
- `ConfirmDialog`: accessible destructive-action confirmation with `alertdialog` semantics, Escape/backdrop cancellation, focus containment/restoration and a busy state.
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

Phase 3 deliberately migrates in slices. The admin navigation, catalog search/filter controls, catalog table and pagination, basic form controls and category chips use shared primitives. The public Web catalog category filters and pagination buttons use the same package with their own pill/compact variants; top navigation, search input and Hero CTA buttons also use shared components. The logo, notification icon, avatar, Hero layout and Plyr-specific styling remain feature-specific. Public catalog cards now share `MediaCard`; detail recommendations use the same implementation so they do not depend on removed legacy selectors. Detail episode cards and continue-watching/history cards use Tailwind utilities. Only the poster gradient pseudo-element and other specialized artwork/player effects remain in custom CSS. Page grids, data-specific content layout, a few specialized controls and custom Plyr styling remain in feature CSS until each section can be migrated and verified without changing behavior. Admin item, episode and category deletion now share `ConfirmDialog` rather than relying on browser-native `confirm()` dialogs. Playback-page episode rows and previous/next navigation use shared button variants and Tailwind utilities; Plyr's internal controls and player state visuals remain feature-specific.


## Responsive and keyboard acceptance

Use this matrix before closing Phase 3. These are required manual browser checks; CI type/build checks do not substitute for visual verification.

| Viewport | Public Web | Admin |
| --- | --- | --- |
| 1440 × 900 | Header, hero, catalog grid, detail layout and player/sidebar fit without unintended horizontal scrolling. | Full sidebar, dashboard cards, catalog table, editor two-column layout and dialogs fit. |
| 1024 × 768 | Catalog columns and detail/player layout remain usable; search and category controls do not overlap. | Sidebar and editor columns remain readable; table actions stay reachable. |
| 768 × 1024 | Navigation collapse, card grids and player episode sidebar remain usable in a portrait tablet viewport. | Collapsed icon navigation retains accessible names; editor and episode forms stack without clipped controls. |
| 390 × 844 | Header/search, category chips, cards, detail metadata, episode selection and Plyr controls remain usable. | Catalog filters, horizontally scrollable table, editor fields, episode cards, category actions and confirmation dialog remain usable. |
| 320 × 700 | No page-level horizontal overflow; text, controls and close/cancel actions remain reachable. | No clipped primary actions; the table may scroll within its container, and form controls remain full-width. |

Keyboard and state checks:
- Tab through top navigation, filters, cards, player navigation and all admin controls; focus indicators remain visible.
- On mobile, open search with the search toggle, verify the input receives focus, test filtering, then close with Escape and the close control.
- At collapsed admin sidebar widths, each icon-only navigation link exposes its text label to assistive technology and as a tooltip.
- Media type choices announce their selected state; category chips announce their pressed/selected state.
- Confirmation dialogs keep focus contained while open, restore focus after close, and prevent dismissal while a destructive request is pending.
- Exercise loading, empty, error and disabled states for catalog, editor, episode management and playback.

Record the browser, viewport and result in the pull request before checking off the visual acceptance exit criterion.


Public header interaction:
- The notification icon opens a clearly labeled, keyboard-focusable empty-state panel rather than behaving as an inert button.
- Verify its expanded state, close control, visible focus ring and narrow viewport placement.
- This is a local empty state only; it does not imply a notification API or persisted notification data exists.

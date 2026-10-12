# @visionhub/ui

Shared, source-first React primitives for VisionHub clients. The package centralizes design tokens and common controls without moving whole pages or specialized Plyr styling into a generic component library.

## Exports

- `@visionhub/ui`: `Button`, `Field`, `Message`, `Badge`, `Panel`, `NavigationItem`, `SearchField`, `SelectControl`, `TextInput`, `TextAreaControl`, `ChoiceChip`, table primitives, `IconButton`, and `PaginationBar`. `Button` offers default/compact sizes and a `surface` variant; `ChoiceChip` offers standard/pill variants so the public catalog can retain its existing styling.
- `@visionhub/ui/tokens.css`: semantic CSS variables used by Web today and desktop later.

Tailwind CSS v4 is the default for shared primitive layout and visual variants. The host app must include `packages/ui/src` in Tailwind's source scan. Page-specific layout and Plyr integration can remain in feature styles until migrated deliberately.

## Conventions

- Add reusable primitives when they are used by multiple features or are clear cross-client building blocks.
- Keep accessible roles, keyboard focus and disabled states in shared controls.
- Use semantic `--vh-*` tokens; do not encode app-specific page layout in the shared package.
- Keep compatibility class hooks temporarily when extracting existing controls; remove them once the last dependent legacy selector is migrated.

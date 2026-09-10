---
name: tanstack-forms
description: Create, edit, review, or use TanStack Form forms and reusable form components in Nexli. Use for form setup, validation, field components, submit components, and changes under packages/ui/src/forms.
---

# TanStack Forms

Use the pre-bound API exported by `@repo/ui/forms`. Inspect `packages/ui/src/forms` and the underlying atom before changing behavior or props.

## Use existing components

- Use `form.AppField` with `InputForm`, `TextareaForm`, `SwitchForm`, or `ToggleForm`.
- Wrap form components with `form.AppForm`; use `SubscribeForm` for submission.
- Configure values, validators, and submission through `useAppForm`.
- Do not import `useStore`; read reactive field state from `field.state.meta` and use `form.Subscribe` for form state.

```tsx
const form = useAppForm({
    defaultValues: { name: '', enabled: false },
    onSubmit: ({ value }) => save(value),
})

<form.AppField name="name">
    {(field) => <field.InputForm label="Name" />}
</form.AppField>

<form.AppForm>
    <form.SubscribeForm pendingContent="Saving...">Save</form.SubscribeForm>
</form.AppForm>
```

## Create a field component

1. Add `<control>-form.tsx` under `packages/ui/src/forms`.
2. Derive props from the UI atom and omit controlled props such as `value`, `defaultValue`, `name`, change handlers, and `aria-invalid`.
3. Bind `useFieldContext<string | boolean>()`, `field.state.value`, `field.handleChange`, `field.handleBlur`, and `field.name` when supported.
4. Use `Field`, `FieldLabel`, `FieldDescription`, and `FieldError`; generate stable IDs with `React.useId` and connect `aria-describedby`.
5. Normalize touched errors with `getVisibleFieldErrors` from `@repo/utils`.
6. Export the props and register the component in `fieldComponents` inside `forms/index.ts`.

For a form-level component, use `useFormContext`, subscribe only to required state with `form.Subscribe`, export its props, and register it in `formComponents`.

Keep string controls and boolean controls distinct. Never allow a toggle button to submit its parent form accidentally.

## Verify

Run Prettier, the `@repo/ui` typecheck and lint, plus `@repo/utils` checks when shared helpers change.

import { ComponentPropsWithoutRef } from 'react'
import { Popup } from '@repo/ui/organisms'
import { PlusIcon } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@repo/ui/atoms'

export type AddCategoryPopupProps = {} & ComponentPropsWithoutRef<'div'>

export const AddCategoryPopup = (props: AddCategoryPopupProps) => {
    const { className, ...rest } = props

    return (
        <div className={className} {...rest}>
            <Popup
                title="Create a new category"
                description="Add a new category to your stock."
                trigger={
                    <Button className="flex w-full items-center gap-x-2" size="sm">
                        Add category
                        <PlusIcon />
                    </Button>
                }
                btnSaveText="Create"
                className="space-y-4"
            >
                <div className="grid w-full gap-2">
                    <Label htmlFor="category-name">Name</Label>
                    <Input type="text" id="category-name" placeholder="Ex: " />
                </div>
                <div className="grid w-full gap-2">
                    <Label htmlFor="category-desc">Description</Label>
                    <Textarea
                        placeholder="Lorem ipsum dolor sit amet."
                        id="category-desc"
                        className="max-h-[6rem]"
                    />
                </div>
            </Popup>
        </div>
    )
}

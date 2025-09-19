import { ComponentPropsWithoutRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/atoms'
import { cn } from '@repo/utils'

export type CategoryCardProps = {} & ComponentPropsWithoutRef<typeof Card>

export const CategoryCard = (props: CategoryCardProps) => {
    const { className, ...rest } = props

    return (
        <Card className={cn('gap-2 py-2 shadow-none', className)} {...rest}>
            <CardHeader className="px-2">
                <CardTitle className="text-sm">Subscribe to our newsletter</CardTitle>
                <CardDescription>
                    Opt-in to receive updates and news about the sidebar.
                </CardDescription>
            </CardHeader>
            <CardContent className="px-2">Lorem ipsum dolor sit amet.</CardContent>
        </Card>
    )
}

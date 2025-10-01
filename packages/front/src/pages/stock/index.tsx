import { CategorySidebar } from './components/category-sidebar.tsx'
import { Button, Input, Label } from '@repo/ui/atoms'
import { ListFilter, Search } from 'lucide-react'
import { CategoryCard } from './components/category-card.tsx'
import { AddCategoryPopup } from './components/add-category-popup.tsx'

export default function StockPage() {
    return (
        <div className="relative flex h-full">
            <CategorySidebar className="grid flex-none grid-rows-[auto_auto_1fr] gap-y-2 py-4">
                <AddCategoryPopup className="px-2" />
                <div className="flex items-center gap-x-2 px-2">
                    <aside className="relative flex-1">
                        <Label htmlFor="category-search" className="sr-only">
                            Search
                        </Label>
                        <Input
                            type="text"
                            id="category-search"
                            placeholder="Search for categories"
                            className="pl-8"
                        />
                        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
                    </aside>
                    <Button variant="secondary" size="icon" className="size-8">
                        <ListFilter />
                    </Button>
                </div>
                <div className="scrollbar-thin space-y-2 overflow-auto px-2 pt-2">
                    {Array.from({ length: 10 }).map((_, index) => (
                        <CategoryCard key={index} />
                    ))}
                </div>
            </CategorySidebar>
            <div className="flex-auto">
                lorem20 ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quidem.
            </div>
        </div>
    )
}

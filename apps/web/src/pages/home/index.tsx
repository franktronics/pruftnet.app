import { Button } from '@repo/ui/atoms'
import { ListFilter } from 'lucide-react'
import { SearchInput } from '@repo/ui/molecules'

function Index() {
    return (
        <main>
            <div className="flex items-center gap-4">
                <SearchInput />
                <Button className="flex items-center gap-1">
                    <span>Sort</span> <ListFilter />
                </Button>
            </div>
        </main>
    )
}

export default Index

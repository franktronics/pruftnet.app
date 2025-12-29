import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Separator } from '@repo/ui/atoms'

export function GeneralSettings() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">General</h3>
                <p className="text-muted-foreground text-sm">
                    Manage your general application settings.
                </p>
            </div>
            <Separator />
            <Card>
                <CardHeader>
                    <CardTitle>Application Name</CardTitle>
                    <CardDescription>
                        The name displayed throughout the application.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="app-name">Name</Label>
                        <Input
                            id="app-name"
                            placeholder="Pruftnet"
                            defaultValue="Pruftnet"
                        />
                    </div>
                    <Button>Save changes</Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Language</CardTitle>
                    <CardDescription>
                        Select your preferred language for the application.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="language">Language</Label>
                        <Input
                            id="language"
                            placeholder="English"
                            defaultValue="English"
                            disabled
                        />
                        <p className="text-muted-foreground text-xs">
                            Additional languages will be available in future updates.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

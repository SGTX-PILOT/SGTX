import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <p className="text-sm text-muted-foreground">Page not found</p>
        <Button onClick={() => window.location.href = "/"}><Home className="w-4 h-4 mr-2" />Go home</Button>
      </div>
    </div>
  );
}

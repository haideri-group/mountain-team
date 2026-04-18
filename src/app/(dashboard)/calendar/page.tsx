import { CalendarView } from "@/components/calendar/calendar-view";

export default function CalendarPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monthly task schedule across developers and boards
        </p>
      </div>

      <CalendarView />
    </div>
  );
}

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, modifiers, modifiersStyles, ...props }: CalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const specialDate = new Date(2026, 4, 5); // May 5, 2026
  specialDate.setHours(0, 0, 0, 0);

  const isSpecialDay = (date: Date) => {
    return date.getFullYear() === specialDate.getFullYear() &&
      date.getMonth() === specialDate.getMonth() &&
      date.getDate() === specialDate.getDate();
  };

  const isFutureTueOrThu = (date: Date) => {
    if (isSpecialDay(date)) return false;
    const day = date.getDay();
    return (day === 2 || day === 4) && date >= today;
  };

  const isOtherDay = (date: Date) => {
    if (isSpecialDay(date)) return false;
    const day = date.getDay();
    if (day === 2 || day === 4) return date < today;
    return true;
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      modifiers={{
        highlighted: isFutureTueOrThu,
        faded: isOtherDay,
        specialDay: isSpecialDay,
        ...modifiers,
      }}
      modifiersStyles={{
        highlighted: { backgroundColor: "hsl(var(--primary) / 0.15)", fontWeight: 600, color: "hsl(var(--primary))" },
        faded: { opacity: 0.35 },
        specialDay: { backgroundColor: "hsl(350 80% 90%)", fontWeight: 700, color: "hsl(350 70% 45%)" },
        ...modifiersStyles,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

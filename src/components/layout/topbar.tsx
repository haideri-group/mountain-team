"use client"

import { Bell, Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function Topbar() {
  return (
    <div className="h-16 flex items-center justify-between px-8 bg-card border-b border-border shrink-0">
      <div className="flex items-center gap-6 flex-1">
        <h1 className="text-xl font-bold font-mono">Team Overview</h1>
        
        {/* Search Bar Example */}
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input 
            type="text" 
            placeholder="Search tasks, members..." 
            className="w-full h-9 pl-9 pr-4 rounded-full bg-input border-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        
        <button className="relative p-2 rounded-full hover:bg-accent transition-colors">
          <Bell className="h-5 w-5 text-foreground" />
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
          </span>
        </button>

        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-xs ml-2 cursor-pointer shadow-sm">
          SC
        </div>
      </div>
    </div>
  );
}

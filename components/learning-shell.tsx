"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";

export function LearningShell({children}:{children:React.ReactNode}) {
	const path=usePathname();
	// Review/library do not mount teaching, extraction, job or subscription observers.
	if(path==="/review"||path==="/library") return <div className="min-h-dvh overflow-auto"><nav className="flex gap-6 border-b px-8 py-5 text-sm"><Link href="/">LearnHarness</Link><Link href="/review">Review</Link><Link href="/library">Source library</Link><span className="ml-auto text-muted-foreground">No LLM calls · optional voice</span></nav>{children}</div>;
	return <ServerEventsProvider><AppearanceProvider><SidebarProvider><ActivityProvider><AppShell>{children}</AppShell></ActivityProvider></SidebarProvider></AppearanceProvider><UpdateBanner/></ServerEventsProvider>;
}

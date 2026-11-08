import { personalGet, personalPost } from "@/src/server/personal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = personalGet;
export const POST = personalPost;

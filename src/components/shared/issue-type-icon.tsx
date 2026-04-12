"use client";

import { cn } from "@/lib/utils";

interface IssueTypeIconProps {
  type: string | null;
  className?: string;
  size?: number;
}

// Actual JIRA issue type SVG icons (from Atlassian's universal_avatar API)
// These are the exact icons shown in JIRA Cloud

export function IssueTypeIcon({ type, className, size = 16 }: IssueTypeIconProps) {
  const t = (type || "task").toLowerCase().replace(/_/g, " ");
  const s = { width: size, height: size };

  switch (t) {
    case "bug":
      // Red bug icon — JIRA avatar/10303
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label="Bug">
          <path clipRule="evenodd" d="m8 2.5c-.82843 0-1.5.67157-1.5 1.5h3c0-.82843-.67157-1.5-1.5-1.5zm3 1.52074v-.02074c0-1.65685-1.34315-3-3-3s-3 1.34315-3 3v.02074c-.29048.04873-.55266.18096-.761.37115l-.88669-.63334-.91695-2.06315-1.37072.6092.94464 2.12544c.09062.20389.23416.37981.41572.50949l1.325.94643v1.11404h-3.25v1.5h3.25v1.14872l-1.14979.95818c-.13248.1104-.24068.247-.3178.4012l-1.20323 2.4065 1.34164.6708 1.17984-2.3597.46058-.3838c.63558 1.5764 2.17703 2.6581 3.94022 2.6581h.24854c1.71908 0 3.1849-1.0844 3.7506-2.6066l.3987.3323 1.1799 2.3597 1.3416-.6708-1.2032-2.4065c-.0771-.1542-.1853-.2908-.3178-.4012l-1.1498-.95818v-1.14872h3.25v-1.5h-3.25v-1.11404l1.325-.94643c.1816-.12968.3251-.3056.4157-.50949l.9447-2.12544-1.3708-.6092-.9169 2.06315-.8867.63334c-.2083-.19019-.4705-.32242-.761-.37115zm-.25 5.97926v-4.5h-5.5v4.44265l.03488.22675c.20629 1.3408 1.35998 2.3306 2.71658 2.3306h.24854c1.38071 0 2.5-1.1193 2.5-2.5z" fill="#f15b50" fillRule="evenodd" />
        </svg>
      );

    case "story":
    case "user story":
      // Green bookmark icon — JIRA avatar/10315
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label="Story">
          <path clipRule="evenodd" d="m4.98291 2.5c-.27614 0-.5.22386-.5.5v9.8059l3.51724-2.4727 3.51775 2.4728v-9.806c0-.27614-.2239-.5-.5-.5zm-2 .5c0-1.10457.89543-2 2-2h6.03499c1.1046 0 2 .89543 2 2v11.25c0 .2799-.1559.5366-.4043.6656s-.548.109-.777-.052l-3.8364-2.6968-3.83595 2.6968c-.229.1609-.5286.181-.77702.052-.24843-.129-.40432-.3857-.40432-.6656z" fill="#6a9a23" fillRule="evenodd" />
        </svg>
      );

    case "epic":
      // Purple lightning bolt — JIRA avatar/10307
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label="Epic">
          <path clipRule="evenodd" d="m10.271.050656c.2887.111871.479.38969.479.699344v4.63515l3.1471.62941c.2652.05303.4812.24469.5655.50161s.0238.53933-.1584.73914l-7.74997 8.49999c-.20863.2288-.53644.3059-.82517.194-.28874-.1118-.47905-.3896-.47905-.6993v-4.6351l-3.14708-.62947c-.26515-.05303-.48123-.24468-.56553-.5016-.08431-.25692-.02379-.53933.1584-.73915l7.75-8.499996c.20863-.2288201.53643-.305899.8252-.194028zm-6.57276 8.724134 3.05177.61036v3.92915l5.55179-6.08909-3.05179-.61036v-3.9291z" fill="#bf63f3" fillRule="evenodd" />
        </svg>
      );

    case "subtask":
    case "sub-task":
    case "sub task":
      // Blue two-piece puzzle — JIRA avatar/10316
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label="Sub-task">
          <path clipRule="evenodd" d="m1 3c0-1.10457.89543-2 2-2h3.75c1.10457 0 2 .89543 2 2v4.25h4.25c1.1046 0 2 .89543 2 2v3.75c0 1.1046-.8954 2-2 2h-3.75c-1.10457 0-2-.8954-2-2v-4.25h-4.25c-1.10457 0-2-.89543-2-2zm6.25 4.25v-4.25c0-.27614-.22386-.5-.5-.5h-3.75c-.27614 0-.5.22386-.5.5v3.75c0 .27614.22386.5.5.5zm1.5 1.5v4.25c0 .2761.22386.5.5.5h3.75c.2761 0 .5-.2239.5-.5v-3.75c0-.27614-.2239-.5-.5-.5z" fill="#4688ec" fillRule="evenodd" />
        </svg>
      );

    case "task":
      // Blue checkbox — JIRA avatar/10318
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label="Task">
          <path clipRule="evenodd" d="m1 3c0-1.10457.89543-2 2-2h10c1.1046 0 2 .89543 2 2v10c0 1.1046-.8954 2-2 2h-10c-1.10457 0-2-.8954-2-2zm2-.5c-.27614 0-.5.22386-.5.5v10c0 .2761.22386.5.5.5h10c.2761 0 .5-.2239.5-.5v-10c0-.27614-.2239-.5-.5-.5zm9.3262 2.98014-5.00003 5.99996c-.1425.171-.35359.2699-.57617.2699s-.43367-.0989-.57617-.2699l-2.5-2.99996 1.15234-.96028 1.92383 2.3086 4.4238-5.3086z" fill="#4688ec" fillRule="evenodd" />
        </svg>
      );

    case "enhancement":
    case "improvement":
      // Green + icon (no JIRA avatar, custom)
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label="Enhancement">
          <rect x="1" y="1" width="14" height="14" rx="2" fill="#6a9a23" />
          <path d="M8 4.5V11.5M4.5 8H11.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "cms change":
    case "cms_change":
      // Orange document icon (custom)
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label="CMS Change">
          <rect x="1" y="1" width="14" height="14" rx="2" fill="#f79232" />
          <path d="M4.5 5H11.5M4.5 8H9.5M4.5 11H7.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );

    default:
      // Fallback: same as Task
      return (
        <svg {...s} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-label={type || "Task"}>
          <path clipRule="evenodd" d="m1 3c0-1.10457.89543-2 2-2h10c1.1046 0 2 .89543 2 2v10c0 1.1046-.8954 2-2 2h-10c-1.10457 0-2-.8954-2-2zm2-.5c-.27614 0-.5.22386-.5.5v10c0 .2761.22386.5.5.5h10c.2761 0 .5-.2239.5-.5v-10c0-.27614-.2239-.5-.5-.5zm9.3262 2.98014-5.00003 5.99996c-.1425.171-.35359.2699-.57617.2699s-.43367-.0989-.57617-.2699l-2.5-2.99996 1.15234-.96028 1.92383 2.3086 4.4238-5.3086z" fill="#4688ec" fillRule="evenodd" />
        </svg>
      );
  }
}

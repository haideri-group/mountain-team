import { redirect } from "next/navigation";

export default function RootPage() {
  // Simply redirect to overview for now until auth is fully hooked up
  redirect("/overview");
}

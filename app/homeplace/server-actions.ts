"use server";

import { redirect } from "next/navigation";

export async function createHomeplaceStoryRoom(formData: FormData) {
  void formData;
  redirect("/start");
}

"use server";

import { redirect } from "next/navigation";

export async function createStoryRoom(formData: FormData) {
  void formData;
  redirect("/start");
}

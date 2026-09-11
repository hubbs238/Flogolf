import { getAllMajors } from "@/lib/majors";
import { MajorsAdmin } from "@/components/majors-admin";

export default async function MajorsAdminPage() {
  const majors = await getAllMajors();
  return <MajorsAdmin majors={majors} />;
}

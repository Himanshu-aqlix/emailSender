const CONTACT_SAMPLE_HEADERS = ["Name", "Email", "Phone", "Company Name"];

export function downloadContactSampleFile() {
  const csvContent = `${CONTACT_SAMPLE_HEADERS.join(",")}\r\n`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "contact-import-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export { CONTACT_SAMPLE_HEADERS };

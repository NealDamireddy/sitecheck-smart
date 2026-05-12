export interface ReportSection {
  id: string;
  number: number;
  title: string;
  content: string;
  editable: boolean;
  edited?: boolean;
}

export interface Report {
  id: string;
  inspectionId: string;
  generatedDate: string;
  sections: ReportSection[];
  signed: boolean;
  signedBy?: string;
  signedDate?: string;
}

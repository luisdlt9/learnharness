/** Copies selected bytes into the managed library; never starts extraction. */
export async function uploadManagedFiles(files: File[]): Promise<string[]> {
	const paths: string[]=[];
	for(const file of files) {
		const form=new FormData(); form.append("files",file);
		const response=await fetch("/api/personal/sources",{method:"POST",headers:{"x-lh-personal":"1"},body:form});
		const result=await response.json();
		if(!response.ok) throw new Error(result.error??"Source copy failed");
		paths.push(...result.sources.map((s:{reference:string})=>s.reference));
	}
	return paths;
}

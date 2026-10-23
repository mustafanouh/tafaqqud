declare module 'pdfmake/build/pdfmake' {
    interface PdfDocument {
        download(filename: string): Promise<void>
    }

    interface PdfMake {
        addVirtualFileSystem(vfs: Record<string, string>): void
        addFonts(fonts: Record<string, Record<string, string>>): void
        createPdf(document: unknown): PdfDocument
    }

    const pdfMake: PdfMake
    export default pdfMake
}

declare module '*.ttf?url' {
    const url: string
    export default url
}

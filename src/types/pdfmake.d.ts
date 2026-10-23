declare module 'pdfmake/build/pdfmake' {
    interface PdfDocument {
        download(filename?: string): Promise<void>
        open(): void
        getBlob(): Promise<Blob>
    }

    interface PdfMake {
        addVirtualFileSystem(vfs: Record<string, string>): void
        addFonts(fonts: Record<string, Record<string, string>>): void
        addFontContainer(container: unknown): void
        createPdf(document: unknown): PdfDocument
    }

    const pdfMake: PdfMake
    export default pdfMake
}

declare module 'pdfmake-rtl/build/pdfmake' {
    interface PdfDocument {
        download(filename?: string): Promise<void>
        open(): void
        getBlob(): Promise<Blob>
    }

    interface PdfMake {
        addVirtualFileSystem(vfs: Record<string, string>): void
        addFonts(fonts: Record<string, Record<string, string>>): void
        addFontContainer(container: unknown): void
        createPdf(document: unknown): PdfDocument
    }

    const pdfMake: PdfMake
    export default pdfMake
}

declare module 'pdfmake-rtl/build/vfs_fonts' {
    const vfs: Record<string, string>
    export default vfs
}

declare module '*.ttf?url' {
    const url: string
    export default url
}

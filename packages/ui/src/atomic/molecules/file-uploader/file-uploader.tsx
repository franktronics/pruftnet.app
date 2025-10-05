import { useState, useCallback } from 'react'
import { Upload, X, Check, File as FileIcon } from 'lucide-react'
import type { DragEvent, ChangeEvent } from 'react'

export type FileUploadZoneProps = {
    fileTypes?: {
        input: string
        file: string
    }[]
    numberOfFiles?: number
    handleUpload?: (files: File[]) => Promise<boolean>
}

function useFileUploadZone() {
    const [isDragging, setIsDragging] = useState(false)
    const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }, [])

    const handleDragOver = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault()
            e.stopPropagation()
            if (!isDragging) {
                setIsDragging(true)
            }
        },
        [isDragging],
    )

    const handleDrop = useCallback((e: DragEvent<HTMLDivElement>): File[] | null => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            return Array.from(e.dataTransfer.files)
        }
        return null
    }, [])

    const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>): File[] | null => {
        if (e.target.files && e.target.files.length > 0) {
            return Array.from(e.target.files)
        }
        return null
    }, [])

    return {
        isDragging,
        setIsDragging,
        handleDragEnter,
        handleDragLeave,
        handleDragOver,
        handleDrop,
        handleFileInputChange,
    }
}

export function FileUploader(props: FileUploadZoneProps) {
    const {
        fileTypes = [{ input: '.csv', file: 'text/csv' }],
        numberOfFiles = 1,
        handleUpload,
    } = props

    const [files, setFiles] = useState<File[]>([])
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>(
        'idle',
    )
    const {
        isDragging,
        handleDragEnter,
        handleDragLeave,
        handleDragOver,
        handleDrop,
        handleFileInputChange,
    } = useFileUploadZone()

    const processFiles = async (newFiles: File[]) => {
        const acceptableFiles = newFiles.filter(
            (file) => fileTypes.find((f) => f.file === file.type) !== undefined,
        )
        if (acceptableFiles.length <= 0) return

        const newFilesList = [...files, ...acceptableFiles]
        setFiles(newFilesList)

        if (!handleUpload) return
        setUploadStatus('uploading')
        const result = await handleUpload(newFilesList)
        if (result) setUploadStatus('success')
        else setUploadStatus('error')
    }

    const removeFile = (index: number) => {
        const newFiles = [...files]
        newFiles.splice(index, 1)
        setFiles(newFiles)

        if (newFiles.length === 0) {
            setUploadStatus('idle')
        }
    }

    const fileInputTypes = Array.from(new Set(fileTypes.map((f) => f.input)))

    return (
        <div
            className={`flex flex-col items-center justify-center gap-2 rounded-md border p-6 transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-dashed'
            }`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={async (e) => {
                if (files.length >= numberOfFiles) return
                const droppedFiles = handleDrop(e)
                if (droppedFiles) {
                    await processFiles(droppedFiles)
                }
            }}
        >
            {uploadStatus === 'idle' && files.length === 0 && (
                <>
                    <div className="bg-primary/10 flex aspect-square w-11 items-center justify-center rounded-full">
                        <Upload className="text-primary h-6 w-6" />
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                        <p className="text-sm font-medium">Drag & drop file</p>
                        <p className="text-muted-foreground text-xs">
                            Support for{' '}
                            {fileInputTypes.map((f) => (
                                <span key={f}>{f.toUpperCase()}</span>
                            ))}{' '}
                            files
                        </p>
                    </div>
                    <label
                        htmlFor="file-upload"
                        className="text-primary cursor-pointer text-sm hover:underline"
                    >
                        or browse files
                    </label>
                    <input
                        id="file-upload"
                        type="file"
                        className="sr-only"
                        accept={fileInputTypes.join(',')}
                        onChange={async (e) => {
                            if (files.length >= numberOfFiles) return
                            const newFiles = handleFileInputChange(e)
                            if (newFiles) {
                                await processFiles(newFiles)
                            }
                        }}
                    />
                </>
            )}

            {files.length > 0 && (
                <div className="w-full space-y-2">
                    {files.map((file, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between rounded-md border p-2"
                        >
                            <div className="flex items-center gap-2">
                                <FileIcon className="text-muted-foreground h-4 w-4" />
                                <span className="max-w-[150px] truncate text-sm">{file.name}</span>
                            </div>
                            {uploadStatus !== 'uploading' && (
                                <button
                                    onClick={() => removeFile(index)}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    ))}

                    <div className="mt-4 flex items-center justify-center">
                        {uploadStatus === 'uploading' && (
                            <div className="flex items-center gap-2">
                                <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
                                <span className="text-xs">Uploading...</span>
                            </div>
                        )}

                        {uploadStatus === 'success' && (
                            <div className="flex items-center gap-2 text-green-500">
                                <Check className="h-4 w-4" />
                                <span className="text-xs">Upload successful!</span>
                            </div>
                        )}

                        {uploadStatus === 'error' && (
                            <div className="flex items-center gap-2 text-red-500">
                                <X className="h-4 w-4" />
                                <span className="text-xs">Upload failed. Please try again.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

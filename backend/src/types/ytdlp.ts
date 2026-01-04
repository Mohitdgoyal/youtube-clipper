export interface YtDlpFormat {
    format_id: string;
    ext: string;
    width?: number;
    height?: number;
    vcodec: string;
    acodec: string;
    fps?: number;
    filesize?: number;
    tbr?: number; // total bitrate
}

export interface YtDlpOutput {
    id: string;
    title: string;
    formats: YtDlpFormat[];
    thumbnail?: string;
    duration?: number;
    webpage_url: string;
}

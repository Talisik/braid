#!/usr/bin/env python3
"""
M3U8 Downloader with Quality Selection and MP4 Conversion
"""

import os
import sys
import requests
import m3u8
import ffmpeg
import tempfile
import shutil
from pathlib import Path
from urllib.parse import urljoin, urlparse
from tqdm import tqdm
from colorama import init, Fore, Style
import concurrent.futures
import threading

# Initialize colorama for cross-platform colored output
init(autoreset=True)

class M3U8Downloader:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        })
        self.temp_dir = None
        self.segment_files = []
        
    def download_m3u8(self, url, output_path=None, quality=None, max_workers=4, custom_headers=None):
        """
        Download M3U8 playlist and convert to MP4
        
        Args:
            url (str): M3U8 playlist URL
            output_path (str): Output MP4 file path
            quality (str): Quality selection ('best', 'worst', or specific resolution)
            max_workers (int): Number of concurrent download threads
            custom_headers (str): Custom headers in format "Header1: Value1, Header2: Value2"
        """
        try:
            print(f"{Fore.CYAN}Fetching M3U8 playlist from: {url}")
            
            # Add custom headers if provided
            if custom_headers:
                self._add_custom_headers(custom_headers)
            
            # Parse the M3U8 playlist
            playlist = self._parse_playlist(url)

            print(playlist.data)
            
            if not playlist:
                print(f"{Fore.RED}Failed to parse M3U8 playlist")
                return False
            
            # Handle master playlist (multiple qualities)
            if playlist.playlists:
                print(f"{Fore.YELLOW}This appears to be a master playlist with multiple qualities")
                selected_url = self._select_quality(playlist, quality)
                if not selected_url:
                    return False
                # Ensure selected_url is properly joined to the cleaned master url
                from urllib.parse import urljoin, urlparse

                # Clean the master url (remove query/fragment, keep scheme+netloc+path)
                parsed_master = urlparse(url)
                cleaned_master_url = f"{parsed_master.scheme}://{parsed_master.netloc}{parsed_master.path}"
                fixed_selected_url = urljoin(cleaned_master_url, selected_url)
                playlist = self._parse_playlist(fixed_selected_url)
                if not playlist:
                    return False
            
            # Download segments
            if not self._download_segments(playlist, url, max_workers):
                return False
            
            # Convert to MP4
            if not self._convert_to_mp4(playlist, output_path):
                return False
            
            print(f"{Fore.GREEN}Download completed successfully!")
            return True
            
        except Exception as e:
            print(f"{Fore.RED}Error: {str(e)}")
            return False
        finally:
            self._cleanup()
    
    def _parse_playlist(self, url):
        """Parse M3U8 playlist from URL"""
        try:
            # Try different approaches for problematic URLs
            response = self.session.get(url, timeout=30, allow_redirects=True)
            response.raise_for_status()
            
            # Parse the playlist
            playlist = m3u8.loads(response.text)
            return playlist
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                print(f"{Fore.RED}Access forbidden (403). The server may be blocking requests.")
                print(f"{Fore.YELLOW}Try using a different URL or check if the content requires authentication.")
            elif e.response.status_code == 404:
                print(f"{Fore.RED}Playlist not found (404). Check if the URL is correct.")
            else:
                print(f"{Fore.RED}HTTP Error {e.response.status_code}: {str(e)}")
            return None
        except requests.exceptions.ConnectionError:
            print(f"{Fore.RED}Connection error. Check your internet connection and try again.")
            return None
        except requests.exceptions.Timeout:
            print(f"{Fore.RED}Request timeout. The server may be slow or unresponsive.")
            return None
        except Exception as e:
            print(f"{Fore.RED}Error parsing playlist: {str(e)}")
            return None
    
    def _select_quality(self, master_playlist, quality_preference):
        """Select quality from master playlist"""
        if not master_playlist.playlists:
            print(f"{Fore.RED}No quality variants found in master playlist")
            return None
        
        # Extract available qualities
        qualities = []
        for playlist in master_playlist.playlists:
            resolution = playlist.stream_info.resolution
            bandwidth = playlist.stream_info.bandwidth
            if resolution:
                width, height = resolution
                qualities.append({
                    'url': playlist.uri,
                    'resolution': f"{width}x{height}",
                    'bandwidth': bandwidth,
                    'playlist': playlist
                })
        
        # Sort by resolution (height)
        qualities.sort(key=lambda x: int(x['resolution'].split('x')[1]), reverse=True)
        
        print(f"\n{Fore.CYAN}Available qualities:")
        for i, q in enumerate(qualities, 1):
            print(f"{Fore.WHITE}{i}. {q['resolution']} ({q['bandwidth']} bps)")
        
        # Auto-select based on preference
        if quality_preference == 'best':
            selected = qualities[0]
        elif quality_preference == 'worst':
            selected = qualities[-1]
        elif quality_preference:
            # Try to match specific resolution
            for q in qualities:
                if quality_preference.lower() in q['resolution'].lower():
                    selected = q
                    break
            else:
                print(f"{Fore.YELLOW}Quality '{quality_preference}' not found, using best quality")
                selected = qualities[0]
        else:
            # Interactive selection
            while True:
                try:
                    choice = input(f"\n{Fore.CYAN}Select quality (1-{len(qualities)}): ").strip()
                    if choice.isdigit() and 1 <= int(choice) <= len(qualities):
                        selected = qualities[int(choice) - 1]
                        break
                    else:
                        print(f"{Fore.RED}Invalid choice. Please enter a number between 1 and {len(qualities)}")
                except KeyboardInterrupt:
                    print(f"\n{Fore.YELLOW}Download cancelled")
                    return None
        
        print(f"{Fore.GREEN}Selected quality: {selected['resolution']}")
        return selected['url']
    
    def _download_segments(self, playlist, base_url, max_workers):
        """Download all segments from the playlist"""
        if not playlist.segments:
            print(f"{Fore.RED}No segments found in playlist")
            return False
        
        # Create temporary directory
        self.temp_dir = tempfile.mkdtemp(prefix="m3u8_download_")
        print(f"{Fore.CYAN}Downloading {len(playlist.segments)} segments...")
        
        # Download segments with progress bar
        with tqdm(total=len(playlist.segments), desc="Downloading segments", 
                 unit="seg", colour="green") as pbar:
            
            def download_segment(segment, index):
                try:
                    segment_url = urljoin(base_url, segment.uri)
                    response = self.session.get(segment_url, timeout=30)
                    response.raise_for_status()
                    
                    segment_file = os.path.join(self.temp_dir, f"segment_{index:05d}.ts")
                    with open(segment_file, 'wb') as f:
                        f.write(response.content)
                    
                    self.segment_files.append(segment_file)
                    pbar.update(1)
                    return True
                except Exception as e:
                    print(f"\n{Fore.RED}Error downloading segment {index}: {str(e)}")
                    return False
            
            # Download segments concurrently
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = []
                for i, segment in enumerate(playlist.segments):
                    future = executor.submit(download_segment, segment, i)
                    futures.append(future)
                
                # Wait for all downloads to complete
                success_count = sum(1 for future in concurrent.futures.as_completed(futures) 
                                  if future.result())
            
            if success_count != len(playlist.segments):
                print(f"{Fore.RED}Failed to download {len(playlist.segments) - success_count} segments")
                return False
        
        return True
    
    def _convert_to_mp4(self, playlist, output_path):
        """Convert downloaded segments to MP4"""
        if not self.segment_files:
            print(f"{Fore.RED}No segments to convert")
            return False
        
        # Generate output filename if not provided
        if not output_path:
            output_path = f"downloaded_video_{len(self.segment_files)}_segments.mp4"
        
        print(f"{Fore.CYAN}Converting to MP4: {output_path}")
        
        try:
            # Create concatenation file for ffmpeg
            concat_file = os.path.join(self.temp_dir, "concat.txt")
            with open(concat_file, 'w') as f:
                for segment_file in sorted(self.segment_files):
                    f.write(f"file '{segment_file}'\n")
            
            # Use ffmpeg to concatenate and convert
            input_stream = ffmpeg.input(concat_file, f='concat', safe=0)
            
            # Preserve original codec if possible, otherwise use h264
            output_stream = ffmpeg.output(
                input_stream,
                output_path,
                vcodec='copy',  # Copy video codec
                acodec='copy',  # Copy audio codec
                f='mp4'
            )
            
            # Run ffmpeg
            ffmpeg.run(output_stream, overwrite_output=True, quiet=True)
            
            print(f"{Fore.GREEN}Conversion completed: {output_path}")
            return True
            
        except Exception as e:
            print(f"{Fore.RED}Error during conversion: {str(e)}")
            # Try alternative conversion method
            return self._convert_alternative(output_path)
    
    def _convert_alternative(self, output_path):
        """Alternative conversion method using h264 codec"""
        try:
            print(f"{Fore.YELLOW}Trying alternative conversion method...")
            
            concat_file = os.path.join(self.temp_dir, "concat.txt")
            with open(concat_file, 'w') as f:
                for segment_file in sorted(self.segment_files):
                    f.write(f"file '{segment_file}'\n")
            
            input_stream = ffmpeg.input(concat_file, f='concat', safe=0)
            output_stream = ffmpeg.output(
                input_stream,
                output_path,
                vcodec='libx264',  # Use h264 codec
                acodec='aac',      # Use AAC audio codec
                f='mp4'
            )
            
            ffmpeg.run(output_stream, overwrite_output=True, quiet=True)
            print(f"{Fore.GREEN}Alternative conversion completed: {output_path}")
            return True
            
        except Exception as e:
            print(f"{Fore.RED}Alternative conversion also failed: {str(e)}")
            return False
    
    def _add_custom_headers(self, headers_str):
        """Parse and add custom headers to the session"""
        try:
            if not headers_str.strip():
                return
            
            print(f"{Fore.CYAN}Adding custom headers...")
            headers = {}
            
            # Parse headers in format "Header1: Value1, Header2: Value2"
            for header_pair in headers_str.split(','):
                if ':' in header_pair:
                    key, value = header_pair.split(':', 1)
                    headers[key.strip()] = value.strip()
            
            if headers:
                self.session.headers.update(headers)
                print(f"{Fore.GREEN}Added {len(headers)} custom headers")
        except Exception as e:
            print(f"{Fore.RED}Error parsing custom headers: {str(e)}")
    
    def _cleanup(self):
        """Clean up temporary files"""
        if self.temp_dir and os.path.exists(self.temp_dir):
            try:
                shutil.rmtree(self.temp_dir)
            except Exception as e:
                print(f"{Fore.YELLOW}Warning: Could not clean up temporary files: {str(e)}")


def main():
    """Main function with command line interface"""
    print(f"{Fore.CYAN}{'='*60}")
    print(f"{Fore.CYAN}M3U8 Downloader with Quality Selection")
    print(f"{Fore.CYAN}{'='*60}")
    
    if len(sys.argv) < 2:
        print(f"{Fore.YELLOW}Usage: python m3u8_downloader.py <m3u8_url> [output_path] [quality] [custom_headers]")
        print(f"{Fore.YELLOW}Quality options: 'best', 'worst', or specific resolution (e.g., '720p')")
        print(f"{Fore.YELLOW}Custom headers format: 'Header1: Value1, Header2: Value2'")
        print(f"{Fore.YELLOW}Example: python m3u8_downloader.py https://example.com/playlist.m3u8 video.mp4 best")
        print(f"{Fore.YELLOW}Example with headers: python m3u8_downloader.py https://example.com/playlist.m3u8 video.mp4 best 'Referer: https://example.com'")
        return
    
    url = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    quality = sys.argv[3] if len(sys.argv) > 3 else None
    custom_headers = sys.argv[4] if len(sys.argv) > 4 else None
    
    downloader = M3U8Downloader()
    success = downloader.download_m3u8(url, output_path, quality, custom_headers=custom_headers)
    
    if success:
        print(f"{Fore.GREEN}Download and conversion completed successfully!")
    else:
        print(f"{Fore.RED}Download failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()



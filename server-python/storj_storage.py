"""
Storj (S3-Compatible) Storage Module
=====================================
Uploads downloaded files to Storj decentralized cloud storage.
Storj is S3-compatible — uses the same boto3 interface as R2.

Setup:
  1. Create a Storj account at https://storj.io
  2. Create a project + bucket in Storj dashboard
  3. Generate S3 credentials (Access → Create Access Grant → S3 Credentials)
  4. Set in Admin Panel or via env variables

Environment Variables:
  STORJ_ENABLED          — "true" to enable Storj uploads (default: "false")
  STORJ_ENDPOINT         — S3 gateway endpoint (e.g., "https://gateway.storjshare.io")
  STORJ_ACCESS_KEY_ID    — S3 Access Key
  STORJ_SECRET_ACCESS_KEY— S3 Secret Key
  STORJ_BUCKET_NAME      — Bucket name (e.g., "video-downloads")
  STORJ_PUBLIC_URL       — Public URL / CDN URL for the bucket
  STORJ_REGION           — Region (default: "us-east-1")
"""

import os
import logging
import threading
from datetime import datetime

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.config import Config as BotoConfig
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False
    logger.info("boto3 not installed — Storj uploads disabled. pip install boto3")


class StorjStorage:
    """Upload files to Storj S3-compatible storage after download."""

    def __init__(self):
        self.enabled = os.environ.get("STORJ_ENABLED", "false").lower() == "true"
        self.endpoint = os.environ.get("STORJ_ENDPOINT", "https://gateway.storjshare.io").rstrip("/")
        self.access_key = os.environ.get("STORJ_ACCESS_KEY_ID", "")
        self.secret_key = os.environ.get("STORJ_SECRET_ACCESS_KEY", "")
        self.bucket = os.environ.get("STORJ_BUCKET_NAME", "video-downloads")
        self.public_url = os.environ.get("STORJ_PUBLIC_URL", "").rstrip("/")
        self.region = os.environ.get("STORJ_REGION", "us-east-1")

        self._client = None

        if self.enabled:
            if not HAS_BOTO3:
                logger.error("Storj enabled but boto3 not installed! Run: pip install boto3")
                self.enabled = False
                return
            if not all([self.access_key, self.secret_key]):
                logger.error("Storj enabled but missing credentials! Set STORJ_ACCESS_KEY_ID, STORJ_SECRET_ACCESS_KEY")
                self.enabled = False
                return
            logger.info(f"Storj Storage: ✅ enabled — bucket: {self.bucket}, endpoint: {self.endpoint}")

    def _make_client(self, endpoint=None, access_key=None, secret_key=None, region=None):
        """Create an S3 client with given or current credentials."""
        if not HAS_BOTO3:
            return None
        return boto3.client(
            "s3",
            endpoint_url=endpoint or self.endpoint,
            aws_access_key_id=access_key or self.access_key,
            aws_secret_access_key=secret_key or self.secret_key,
            config=BotoConfig(
                region_name=region or self.region,
                retries={"max_attempts": 3, "mode": "adaptive"},
            ),
        )

    def update_config(self, config: dict):
        """Update configuration at runtime (from admin panel)."""
        if "endpoint" in config and config["endpoint"]:
            self.endpoint = config["endpoint"].rstrip("/")
        if "access_key" in config and config["access_key"]:
            self.access_key = config["access_key"]
        if "secret_key" in config and config["secret_key"]:
            self.secret_key = config["secret_key"]
        if "bucket" in config and config["bucket"]:
            self.bucket = config["bucket"]
        if "public_url" in config:
            self.public_url = config["public_url"].rstrip("/")
        if "region" in config and config["region"]:
            self.region = config["region"]

        # Auto-enable if credentials are provided
        has_creds = bool(self.access_key and self.secret_key)
        if "enabled" in config:
            self.enabled = bool(config["enabled"])
        elif has_creds and not self.enabled:
            # Auto-enable when credentials are present but enabled wasn't explicitly set
            self.enabled = True

        # Reset client so it reconnects with new credentials
        self._client = None

        if self.enabled and not has_creds:
            logger.error("Storj: enabled but missing credentials after config update")
            self.enabled = False

    def get_config(self) -> dict:
        """Return current config (with masked secrets) for admin panel."""
        return {
            "enabled": self.enabled,
            "endpoint": self.endpoint,
            "access_key": (self.access_key[:4] + "..." + self.access_key[-4:]) if len(self.access_key) > 8 else ("****" if self.access_key else ""),
            "secret_key": "****" if self.secret_key else "",
            "bucket": self.bucket,
            "public_url": self.public_url,
            "region": self.region,
        }

    @property
    def client(self):
        if self._client is None and self.enabled:
            self._client = self._make_client()
        return self._client

    def upload_file(self, filepath: str, folder: str = "downloads") -> dict:
        """
        Upload a file to Storj and return {"url": "...", "key": "..."} or {"error": "..."}
        """
        if not self.enabled:
            return {"error": "Storj not enabled"}

        if not os.path.exists(filepath):
            return {"error": f"File not found: {filepath}"}

        filename = os.path.basename(filepath)
        date_prefix = datetime.now().strftime("%Y/%m/%d")
        key = f"{folder}/{date_prefix}/{filename}"

        try:
            file_size = os.path.getsize(filepath)
            logger.info(f"Storj uploading: {filename} ({file_size / 1048576:.1f} MB) → {key}")

            # Determine content type
            content_type = "application/octet-stream"
            ext = os.path.splitext(filename)[1].lower()
            type_map = {
                ".mp4": "video/mp4",
                ".webm": "video/webm",
                ".mkv": "video/x-matroska",
                ".mp3": "audio/mmpeg",
                ".m4a": "audio/mp4",
                ".opus": "audio/opus",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
            }
            content_type = type_map.get(ext, content_type)

            self.client.upload_file(
                filepath,
                self.bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": "public, max-age=86400",
                },
            )

            # Build public URL
            if self.public_url:
                url = f"{self.public_url}/{key}"
            else:
                url = f"{self.endpoint}/{self.bucket}/{key}"

            logger.info(f"Storj upload complete: {url}")
            return {"url": url, "key": key, "size": file_size}

        except Exception as e:
            logger.error(f"Storj upload failed for {filename}: {e}")
            return {"error": str(e)}

    def upload_file_async(self, filepath: str, folder: str = "downloads"):
        """Upload in background thread."""
        if not self.enabled:
            return
        thread = threading.Thread(
            target=self._upload_and_cleanup,
            args=(filepath, folder),
            daemon=True,
        )
        thread.start()

    def _upload_and_cleanup(self, filepath: str, folder: str):
        """Upload to Storj, then delete local file if upload succeeded."""
        result = self.upload_file(filepath, folder)
        if "url" in result:
            try:
                os.remove(filepath)
                logger.info(f"Storj uploaded & local file removed: {os.path.basename(filepath)}")
            except Exception as e:
                logger.error(f"Failed to remove local file: {e}")
        else:
            logger.warning(f"Storj upload failed, keeping local file: {filepath}")

    def test_connection(self, config_override: dict = None) -> dict:
        """
        Test Storj connection — returns status info.
        config_override: optional dict with credentials to test BEFORE saving.
                         If provided, creates a temporary client with those creds.
        """
        if not HAS_BOTO3:
            return {"enabled": False, "reason": "boto3 not installed — run: pip install boto3"}

        # If config_override provided, test with those credentials
        if config_override:
            endpoint = (config_override.get("endpoint") or self.endpoint).rstrip("/")
            access_key = config_override.get("access_key") or self.access_key
            secret_key = config_override.get("secret_key") or self.secret_key
            bucket = config_override.get("bucket") or self.bucket
            region = config_override.get("region") or self.region
            public_url = config_override.get("public_url") or self.public_url

            if not all([access_key, secret_key]):
                return {
                    "enabled": False,
                    "reason": "Missing Access Key or Secret Key — fill in both fields first",
                    "hint": "Go to Storj Dashboard → Access → Create Access Grant → S3 Credentials",
                }

            try:
                test_client = self._make_client(
                    endpoint=endpoint,
                    access_key=access_key,
                    secret_key=secret_key,
                    region=region,
                )
                if not test_client:
                    return {"enabled": False, "reason": "Failed to create S3 client (boto3 not installed)"}

                test_client.head_bucket(Bucket=bucket)

                # Try listing objects to verify read access
                list_result = test_client.list_objects_v2(Bucket=bucket, MaxKeys=1)

                return {
                    "enabled": True,
                    "status": "connected",
                    "bucket": bucket,
                    "endpoint": endpoint,
                    "region": region,
                    "public_url": public_url or "⚠️ Not configured — files will use endpoint URL",
                    "objects_count": list_result.get("KeyCount", 0),
                    "message": "✅ Connection successful! Storj bucket is accessible.",
                }
            except Exception as e:
                error_msg = str(e)
                # Provide helpful hints based on common errors
                hint = ""
                if "AccessDenied" in error_msg or "403" in error_msg:
                    hint = "Check that your Access Key has read/write permissions for this bucket"
                elif "NoSuchBucket" in error_msg or "404" in error_msg:
                    hint = f"Bucket '{bucket}' doesn't exist — create it in Storj dashboard first"
                elif "InvalidAccessKeyId" in error_msg:
                    hint = "Access Key ID is incorrect — copy it exactly from Storj S3 Credentials"
                elif "SignatureDoesNotMatch" in error_msg:
                    hint = "Secret Access Key is incorrect — copy it exactly from Storj S3 Credentials"
                elif "connect" in error_msg.lower() or "timeout" in error_msg.lower():
                    hint = f"Cannot reach endpoint '{endpoint}' — check the URL is correct"
                return {
                    "enabled": True,
                    "status": "error",
                    "bucket": bucket,
                    "endpoint": endpoint,
                    "error": error_msg,
                    "hint": hint,
                }

        # Test with current saved config
        if not self.enabled:
            # Even if not enabled, still try to connect if we have credentials
            if self.access_key and self.secret_key:
                try:
                    test_client = self._make_client()
                    test_client.head_bucket(Bucket=self.bucket)
                    return {
                        "enabled": True,
                        "status": "connected",
                        "bucket": self.bucket,
                        "endpoint": self.endpoint,
                        "public_url": self.public_url or "⚠️ Not set",
                        "note": "Credentials work! Enable Storj storage to use it.",
                    }
                except Exception as e:
                    return {
                        "enabled": False,
                        "status": "error",
                        "error": str(e),
                        "bucket": self.bucket,
                        "endpoint": self.endpoint,
                    }
            return {"enabled": False, "reason": "No credentials configured — fill in Access Key and Secret Key first"}

        try:
            self.client.head_bucket(Bucket=self.bucket)
            return {
                "enabled": True,
                "bucket": self.bucket,
                "endpoint": self.endpoint,
                "public_url": self.public_url or "not configured",
                "status": "connected",
            }
        except Exception as e:
            return {"enabled": True, "bucket": self.bucket, "endpoint": self.endpoint, "status": "error", "error": str(e)}


# Singleton instance
storj = StorjStorage()

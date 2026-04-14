"""
Cloudflare R2 Storage Module
=============================
Uploads downloaded files to Cloudflare R2 (S3-compatible).
This saves your server bandwidth — users download directly from R2.

Setup:
  1. Go to Cloudflare Dashboard → R2 → Create Bucket
  2. Go to R2 → Manage R2 API → Create API Token
  3. Set environment variables (see below)

Environment Variables:
  R2_ACCOUNT_ID       — Your Cloudflare Account ID
  R2_ACCESS_KEY_ID    — R2 API Token Access Key
  R2_SECRET_ACCESS_KEY— R2 API Token Secret Key
  R2_BUCKET_NAME      — R2 Bucket name (e.g., "video-downloads")
  R2_PUBLIC_URL       — Public URL for the bucket (e.g., "https://cdn.yourdomain.com")
  R2_ENABLED          — "true" to enable R2 uploads (default: "false")
"""

import os
import logging
import threading
from datetime import datetime

logger = logging.getLogger(__name__)

# R2 is S3-compatible — boto3 works with it
try:
    import boto3
    from botocore.config import Config as BotoConfig
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False
    logger.info("boto3 not installed — R2 uploads disabled. pip install boto3")


class R2Storage:
    """Upload files to Cloudflare R2 after download."""

    def __init__(self):
        self.enabled = os.environ.get("R2_ENABLED", "false").lower() == "true"
        self.account_id = os.environ.get("R2_ACCOUNT_ID", "")
        self.access_key = os.environ.get("R2_ACCESS_KEY_ID", "")
        self.secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "")
        self.bucket = os.environ.get("R2_BUCKET_NAME", "video-downloads")
        self.public_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")

        self._client = None

        if self.enabled:
            if not HAS_BOTO3:
                logger.error("R2 enabled but boto3 not installed! Run: pip install boto3")
                self.enabled = False
                return
            if not all([self.account_id, self.access_key, self.secret_key]):
                logger.error("R2 enabled but missing credentials! Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
                self.enabled = False
                return
            logger.info(f"R2 Storage: ✅ enabled — bucket: {self.bucket}")

    @property
    def client(self):
        if self._client is None and self.enabled:
            endpoint = f"https://{self.account_id}.r2.cloudflarestorage.com"
            self._client = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                config=BotoConfig(
                    region_name="auto",
                    retries={"max_attempts": 3, "mode": "adaptive"},
                ),
            )
        return self._client

    def upload_file(self, filepath: str, folder: str = "downloads") -> dict:
        """
        Upload a file to R2 and return {"url": "...", "key": "..."} or {"error": "..."}
        """
        if not self.enabled:
            return {"error": "R2 not enabled"}

        if not os.path.exists(filepath):
            return {"error": f"File not found: {filepath}"}

        filename = os.path.basename(filepath)
        date_prefix = datetime.now().strftime("%Y/%m/%d")
        key = f"{folder}/{date_prefix}/{filename}"

        try:
            file_size = os.path.getsize(filepath)
            logger.info(f"R2 uploading: {filename} ({file_size / 1048576:.1f} MB) → {key}")

            # Determine content type
            content_type = "application/octet-stream"
            ext = os.path.splitext(filename)[1].lower()
            type_map = {
                ".mp4": "video/mp4",
                ".webm": "video/webm",
                ".mkv": "video/x-matroska",
                ".mp3": "audio/mpeg",
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
                url = f"https://{self.bucket}.{self.account_id}.r2.cloudflarestorage.com/{key}"

            logger.info(f"R2 upload complete: {url}")
            return {"url": url, "key": key, "size": file_size}

        except Exception as e:
            logger.error(f"R2 upload failed for {filename}: {e}")
            return {"error": str(e)}

    def upload_file_async(self, filepath: str, folder: str = "downloads"):
        """Upload in background thread — doesn't block the response."""
        if not self.enabled:
            return
        thread = threading.Thread(
            target=self._upload_and_cleanup,
            args=(filepath, folder),
            daemon=True,
        )
        thread.start()

    def _upload_and_cleanup(self, filepath: str, folder: str):
        """Upload to R2, then delete local file if upload succeeded."""
        result = self.upload_file(filepath, folder)
        if "url" in result:
            try:
                os.remove(filepath)
                logger.info(f"R2 uploaded & local file removed: {os.path.basename(filepath)}")
            except Exception as e:
                logger.error(f"Failed to remove local file: {e}")
        else:
            logger.warning(f"R2 upload failed, keeping local file: {filepath}")

    def get_config(self) -> dict:
        """Return current config (with masked secrets) for admin panel."""
        return {
            "enabled": self.enabled,
            "account_id": self.account_id,
            "access_key": (self.access_key[:4] + "..." + self.access_key[-4:]) if len(self.access_key) > 8 else "****",
            "secret_key": "****" if self.secret_key else "",
            "bucket": self.bucket,
            "public_url": self.public_url,
        }

    def update_config(self, config: dict):
        """Update configuration at runtime (from admin panel)."""
        if "enabled" in config:
            self.enabled = config["enabled"]
        if "account_id" in config and config["account_id"]:
            self.account_id = config["account_id"]
        if "access_key" in config and config["access_key"] and not config["access_key"].startswith("****"):
            self.access_key = config["access_key"]
        if "secret_key" in config and config["secret_key"] and config["secret_key"] != "****":
            self.secret_key = config["secret_key"]
        if "bucket" in config and config["bucket"]:
            self.bucket = config["bucket"]
        if "public_url" in config:
            self.public_url = config["public_url"].rstrip("/")
        # Reset client so it reconnects with new credentials
        self._client = None
        if self.enabled and not all([self.account_id, self.access_key, self.secret_key]):
            logger.error("R2: enabled but missing credentials after config update")
            self.enabled = False

    def test_connection(self, config_override: dict = None) -> dict:
        """Test R2 connection — returns status info. config_override for testing before saving."""
        if not HAS_BOTO3:
            return {"enabled": False, "reason": "boto3 not installed — run: pip install boto3"}

        # If config_override provided, test with those credentials
        if config_override:
            account_id = config_override.get("account_id") or self.account_id
            access_key = config_override.get("access_key") or self.access_key
            secret_key = config_override.get("secret_key") or self.secret_key
            bucket = config_override.get("bucket") or self.bucket
            public_url = config_override.get("public_url") or self.public_url

            if not all([account_id, access_key, secret_key]):
                return {"enabled": False, "reason": "Missing Account ID, Access Key, or Secret Key"}

            # Don't test with masked credentials
            if access_key.startswith("****") or secret_key == "****":
                return {"enabled": False, "reason": "Enter new credentials (current ones are masked)"}

            try:
                endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
                test_client = boto3.client(
                    "s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key,
                    config=BotoConfig(region_name="auto", retries={"max_attempts": 3, "mode": "adaptive"}),
                )
                test_client.head_bucket(Bucket=bucket)
                return {
                    "enabled": True,
                    "status": "connected",
                    "bucket": bucket,
                    "account_id": account_id,
                    "public_url": public_url or "⚠️ Not configured",
                    "message": "✅ Connection successful! R2 bucket is accessible.",
                }
            except Exception as e:
                error_msg = str(e)
                hint = ""
                if "AccessDenied" in error_msg or "403" in error_msg:
                    hint = "Check that your API token has Object Read & Write permissions"
                elif "NoSuchBucket" in error_msg or "404" in error_msg:
                    hint = f"Bucket '{bucket}' doesn't exist — create it in Cloudflare R2 dashboard"
                elif "InvalidAccessKeyId" in error_msg:
                    hint = "Access Key ID is incorrect"
                elif "SignatureDoesNotMatch" in error_msg:
                    hint = "Secret Access Key is incorrect"
                return {"enabled": True, "status": "error", "bucket": bucket, "error": error_msg, "hint": hint}

        # Test with current saved config
        if not self.enabled:
            return {"enabled": False, "reason": "R2 not enabled — fill in credentials and enable it"}
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return {
                "enabled": True,
                "bucket": self.bucket,
                "public_url": self.public_url or "not configured",
                "status": "connected",
            }
        except Exception as e:
            return {"enabled": True, "bucket": self.bucket, "status": "error", "error": str(e)}


# Singleton instance
r2 = R2Storage()

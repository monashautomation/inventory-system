import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { authClient } from "@/auth/client";
import { UserAvatar, getInitials } from "@/components/user/UserAvatar";
import { getCroppedImg } from "@/utils/cropImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { getBaseUrl } from "@/lib/utils";

function avatarProxyUrl(userId: string) {
  return `${getBaseUrl()}/api/users/${userId}/avatar`;
}

export function AvatarUploadCard() {
  const { data: session, refetch } = authClient.useSession();
  const user = session?.user;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleSave() {
    if (!cropSrc || !croppedAreaPixels || !user?.id) return;
    setUploading(true);
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels, rotation);
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");

      const res = await fetch(`${getBaseUrl()}/api/users/me/avatar`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(err.message ?? "Upload failed");
      }

      await authClient.updateUser({ image: avatarProxyUrl(user.id) });
      await refetch();
      setCropSrc(null);
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!user?.id) return;
    setRemoving(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/users/me/avatar`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Remove failed");

      await authClient.updateUser({ image: null });
      await refetch();
      toast.success("Avatar removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  }

  const hasCustomAvatar = user?.image?.includes("/api/users/");

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Profile photo</CardTitle>
          <CardDescription>
            Your photo appears across the app. Default shows your initials (
            {user?.name ? getInitials(user.name) : "?"}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <UserAvatar name={user?.name} image={user?.image} size="lg" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openFilePicker}
                className="gap-1.5"
              >
                <Camera className="h-4 w-4" />
                {hasCustomAvatar ? "Change" : "Upload"}
              </Button>
              {hasCustomAvatar && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRemove()}
                  disabled={removing}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={!!cropSrc} onOpenChange={(o) => !o && setCropSrc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust photo</DialogTitle>
          </DialogHeader>

          <div className="relative h-72 bg-black/80 rounded-lg overflow-hidden">
            {cropSrc && (
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="space-y-3 px-1">
            <div className="flex items-center gap-3">
              <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary h-1.5 cursor-pointer"
              />
              <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14 shrink-0">
                Rotate
              </span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="w-full accent-primary h-1.5 cursor-pointer"
              />
              <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                {rotation}°
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCropSrc(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={uploading}>
              {uploading ? "Saving…" : "Save photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

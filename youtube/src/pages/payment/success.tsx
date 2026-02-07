import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext"; //
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentSuccess = () => {
  const router = useRouter();
  const { session_id } = router.query;
  // Use 'login' instead of 'refreshUser' to FORCE update the state
  const { login } = useUser(); 
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  // Ref to prevent double-firing in React Strict Mode
  const verificationAttempted = useRef(false);

  useEffect(() => {
    if (!session_id) return;
    
    // Stop duplicate requests
    if (verificationAttempted.current) return;
    verificationAttempted.current = true;

    const verify = async () => {
      try {
        const response = await axiosInstance.post(
          "/payment/verify",
          { session_id },
          { timeout: 180000 }
        );
        setStatus("success");
        
        // 🔹 CRITICAL FIX: Use login() to overwrite the user state completely
        // This works even if the local state was null or stale
        console.log("Updating user state with:", response.data.user);
        login(response.data.user);
        
        toast.success(`Welcome to ${response.data.user.plan} Plan!`);
      } catch (error: any) {
        console.error("Payment verification error:", error);
        // Only set error if it's a real failure (not a 200 OK "Already Verified" response)
        if (error.response?.status !== 200) {
           setStatus("error");
           toast.error(error.response?.data?.message || "Verification failed");
        }
      }
    };

    verify();
  }, [session_id, login]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      {status === "loading" && (
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Verifying Payment...</h1>
          <p className="text-muted-foreground">Please do not close this window.</p>
        </div>
      )}

      {status === "success" && (
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-green-600 dark:text-green-400">Payment Successful!</h1>
          <p className="text-muted-foreground mb-6">You are now a Premium member.</p>
          <Button onClick={() => router.push("/")} className="bg-primary hover:bg-primary/90">
            Go Home
          </Button>
        </div>
      )}

      {status === "error" && (
        <div className="text-center">
          <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-destructive">Verification Failed</h1>
          <p className="text-muted-foreground mb-6">Please contact support or try refreshing.</p>
          <Button onClick={() => router.push("/")} variant="outline">
            Go Home
          </Button>
        </div>
      )}
    </div>
  );
};

export default PaymentSuccess;

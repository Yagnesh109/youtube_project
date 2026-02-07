import "@/styles/globals.css";
import { UserProvider, useUser } from "@/lib/AuthContext";
import { CallProvider, useCall } from "@/lib/CallContext";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import LoginDialog from "@/components/LoginDialog";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { AppProps } from "next/app";

// Wrapper component to handle protection
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, handleAuthStateChange, login } = useUser();
  const [isClient, setIsClient] = useState(false);
  const [showOTPDialog, setShowOTPDialog] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Show loading spinner
  if (loading || !isClient) return <div className="h-screen w-full flex items-center justify-center">Loading...</div>;

  // If no user, show Blur + Login Dialog
  if (!user) {
    return (
      <div className="relative h-screen overflow-hidden">
        {/* Blurred Content Background */}
        <div className="absolute inset-0 blur-xl opacity-50 pointer-events-none bg-background dark:bg-background">
             {children}
        </div>
        
        {/* Force Login Dialog */}
        <LoginDialog 
            isOpen={true} 
            onClose={() => {}} // Disable closing
            onLoginSuccess={(u, token) => {
              login(u, token);
              handleAuthStateChange(u);
            }}
        />
        
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <h1 className="text-2xl font-bold text-foreground dark:text-foreground">Please Sign In to Access Content</h1>
        </div>
      </div>
    );
  }

  // If user exists but OTP not verified, show OTP verification dialog
  if (user && !user.isOTPVerified) {
    return (
      <div className="relative h-screen overflow-hidden">
        {/* Blurred Content Background */}
        <div className="absolute inset-0 blur-xl opacity-50 pointer-events-none bg-background dark:bg-background">
             {children}
        </div>
        
        {/* Force OTP Verification Dialog */}
        <LoginDialog 
            isOpen={true} 
            onClose={() => {}} // Disable closing
            existingUser={user} // Pass existing user to skip Google sign-in
            onLoginSuccess={(u, token) => {
              login(u, token);
              setShowOTPDialog(false);
            }}
        />
        
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <h1 className="text-2xl font-bold text-foreground dark:text-foreground">Please Complete OTP Verification to Access Content</h1>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const CallReturnButton = () => {
  const { isCallActive, isCallVisible, showCall } = useCall();
  if (!isCallActive || isCallVisible) return null;
  return (
    <button
      onClick={showCall}
      className="fixed bottom-6 right-6 z-[60] bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg"
    >
      Return to Call
    </button>
  );
};

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isWatchPage = router.pathname.startsWith('/watches/');
  const shouldShowSidebar = !isWatchPage;

  return (
    <UserProvider>
      <CallProvider>
        <div className="min-h-screen bg-background dark:bg-background font-sans antialiased">
          <Header />
          
          {/* Wrap main content in AuthGuard */}
          <AuthGuard>
            <div className="flex">
              {shouldShowSidebar && <Sidebar />}
              <main className="flex-1 py-4">
                <Component {...pageProps} />
              </main>
            </div>
          </AuthGuard>

          <CallReturnButton />
          <Toaster />
        </div>
      </CallProvider>
    </UserProvider>
  );
}

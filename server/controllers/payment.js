import Stripe from "stripe"; //
import users from "../Modals/Auth.js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const createOrder = async (req, res) => {
    // ... (Keep existing createOrder logic unchanged)
    const { amount, userId, plan } = req.body; 
    try {
        if (amount < 50) {
            return res.status(400).json({ message: "Amount must be at least ₹50 for Stripe transactions." });
        }
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "inr",
                        product_data: {
                            name: `YouTube Clone - ${plan} Plan`,
                            description: `Upgrade to ${plan} tier`,
                        },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/`, 
            metadata: {
                userId: userId.toString(),
                plan: plan,
                amount: amount.toString()
            },
        });
        res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(500).json({ message: error.raw ? error.raw.message : "Order creation failed" });
    }
};

export const verifyPayment = async (req, res) => {
  const { session_id } = req.body;

  try {
    console.log("Verifying payment for session:", session_id);
    
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status === "paid") {
      const { userId, plan, amount } = session.metadata;
      
      // 1. Fetch current user state
      const currentUser = await users.findById(userId);

      // 2. IDEMPOTENCY CHECK: If user is already on this plan, DO NOT send email again
      if (currentUser.plan === plan && currentUser.isPremium === true) {
          console.log("User already upgraded. Skipping duplicate processing.");
          return res.status(200).json({ message: "Payment verified (Already Updated)", user: currentUser });
      }

      // 3. Update User Plan
      const updatedUser = await users.findByIdAndUpdate(
        userId,
        { 
          isPremium: true,
          plan: plan
        },
        { new: true }
      );
      
      console.log("User updated:", updatedUser.email, updatedUser.plan);

      // 4. Send Invoice Email (Only happens if we passed the check above)
      try {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: updatedUser.email,
          subject: `Invoice: ${plan} Plan Upgrade Successful`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h1 style="color: #d32f2f;">Payment Successful</h1>
              <p>Hello <strong>${updatedUser.name}</strong>,</p>
              <p>Thank you for upgrading to the <strong>${plan} Plan</strong>.</p>
              <hr />
              <h3>Invoice Details</h3>
              <p><strong>Plan:</strong> ${plan}</p>
              <p><strong>Amount Paid:</strong> ₹${amount}</p>
              <p><strong>Transaction ID:</strong> ${session.payment_intent}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              <hr />
              <p>Enjoy your extended viewing experience!</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log("Invoice email sent to:", updatedUser.email);
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
      }

      res.status(200).json({ message: "Payment verified and Plan updated", user: updatedUser });
    } else {
      res.status(400).json({ message: "Payment not completed" });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ message: "Payment verification failed" });
  }
};
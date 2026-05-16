import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  TrendingUp,
  Shield,
  Zap,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <Badge className="w-fit" variant="secondary">
              Inventory Management Made Simple
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Track, Manage, and Optimize Your Inventory
            </h1>
            <p className="text-lg text-muted-foreground">
              A powerful, intuitive inventory system designed to streamline your
              operations. Track assets, manage loans, and gain insights with
              real-time analytics.
            </p>
            <div className="flex gap-4">
              <Button size="lg" onClick={() => navigate("/dashboard")}>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything You Need to Manage Inventory
          </h2>
          <p className="text-muted-foreground text-lg">
            Powerful features designed for efficiency and ease of use
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <Package className="h-10 w-10 mb-2 text-primary" />
              <CardTitle>Asset Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Track all your assets with QR codes, custom tags, and detailed
                metadata for complete visibility.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <TrendingUp className="h-10 w-10 mb-2 text-primary" />
              <CardTitle>Real-Time Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Get insights into loan history, inventory distribution, and
                usage patterns with interactive charts.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-10 w-10 mb-2 text-primary" />
              <CardTitle>Secure & Reliable</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Built with security in mind. Your data is protected with
                industry-standard encryption.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="h-10 w-10 mb-2 text-primary" />
              <CardTitle>Lightning Fast</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Optimized performance with average API response times under 30ms
                for seamless operations.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="bg-primary/5 rounded-lg p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">
                Why Choose Our System?
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Reduce Errors by 80%</h3>
                    <p className="text-sm text-muted-foreground">
                      Automated tracking eliminates manual entry mistakes
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Save Time & Resources
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Streamlined workflows reduce inventory management time
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Complete Visibility</h3>
                    <p className="text-sm text-muted-foreground">
                      Know exactly where every item is, at any time
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Scalable Solution</h3>
                    <p className="text-sm text-muted-foreground">
                      Grows with your business from small teams to enterprises
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Ready to Get Started?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Join hundreds of teams already managing their inventory more
                  efficiently.
                </p>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => navigate("/app/dashboard")}
                >
                  Start Managing Inventory
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  No credit card required
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="container mx-auto px-4 py-8 border-t">
        <div className="text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Inventory System. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

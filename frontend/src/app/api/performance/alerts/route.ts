import { NextRequest, NextResponse } from 'next/server';

// In-memory store for alerts (server-side only)
const alertHistory: Array<{
  metric: string;
  value: number;
  threshold: number;
  severity: string;
  timestamp: number;
  url: string;
}> = [];

const defaultConfig = {
  enabled: true,
  thresholds: {
    cls: { warning: 0.1, critical: 0.25 },
    fid: { warning: 100, critical: 300 },
    fcp: { warning: 1800, critical: 3000 },
    lcp: { warning: 2500, critical: 4000 },
    ttfb: { warning: 800, critical: 1800 },
  },
  notifications: {
    console: true,
    toast: true,
    external: false,
  },
  cooldown: 30000,
};

export async function POST(request: NextRequest) {
  try {
    const alert = await request.json();
    
    // Validate the alert structure
    if (!alert.metric || !alert.value || !alert.timestamp) {
      return NextResponse.json(
        { error: 'Invalid alert structure' },
        { status: 400 }
      );
    }

    // Store alert
    alertHistory.push(alert);
    if (alertHistory.length > 500) {
      alertHistory.splice(0, alertHistory.length - 500);
    }

    // Process the alert
    console.log('Performance alert received:', {
      metric: alert.metric,
      value: alert.value,
      severity: alert.severity,
      url: alert.url,
      timestamp: alert.timestamp,
    });

    if (alert.severity === 'high' || alert.severity === 'critical') {
      console.warn('🚨 HIGH SEVERITY ALERT:', alert);
    }

    return NextResponse.json({ 
      success: true,
      message: 'Alert processed',
      alertId: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });

  } catch (error) {
    console.error('Error processing performance alert:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      alerts: alertHistory.slice(-50),
      total: alertHistory.length,
      config: defaultConfig,
    });

  } catch (error) {
    console.error('Error fetching performance alerts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

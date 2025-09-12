export const emailStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f8f9fa;
    margin: 0;
    padding: 20px;
  }
  
  .container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 12px;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }
  
  .header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 40px 30px;
    text-align: center;
  }
  
  .logo {
    font-size: 48px;
    margin-bottom: 15px;
  }
  
  .header h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 8px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.3);
  }
  
  .subtitle {
    font-size: 16px;
    opacity: 0.9;
    font-weight: 300;
  }
  
  .content {
    padding: 30px;
  }
  
  .greeting h2 {
    color: #2c3e50;
    margin-bottom: 15px;
    font-size: 24px;
  }
  
  .alert {
    padding: 20px;
    border-radius: 8px;
    margin: 25px 0;
    border-left: 4px solid;
  }
  
  .alert-success {
    background-color: #d4edda;
    border-left-color: #28a745;
    color: #155724;
  }
  
  .info-card {
    background-color: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 25px;
    margin: 25px 0;
  }
  
  .info-card h3 {
    color: #2c3e50;
    margin-bottom: 20px;
    font-size: 20px;
    border-bottom: 2px solid #e9ecef;
    padding-bottom: 10px;
  }
  
  .data-row {
    display: flex;
    margin: 12px 0;
    align-items: center;
    padding: 8px 0;
  }
  
  .data-row.primary {
    background-color: #fff3cd;
    padding: 15px;
    border-radius: 6px;
    border-left: 4px solid #ffc107;
  }
  
  .label {
    font-weight: 600;
    color: #495057;
    min-width: 120px;
    margin-right: 15px;
  }
  
  .value {
    color: #2c3e50;
    font-weight: 500;
  }
  
  .email {
    color: #007bff;
    font-weight: 700;
    text-decoration: underline;
  }
  
  .action-section {
    margin: 30px 0;
    padding: 25px;
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border-radius: 8px;
  }
  
  .action-section h3 {
    color: #2c3e50;
    margin-bottom: 15px;
  }
  
  .action-list {
    list-style: none;
    padding: 0;
  }
  
  .action-list li {
    padding: 8px 0;
    padding-left: 25px;
    position: relative;
  }
  
  .action-list li:before {
    content: "✓";
    position: absolute;
    left: 0;
    color: #28a745;
    font-weight: bold;
  }
  
  .timeline {
    margin: 20px 0;
  }
  
  .timeline-item {
    display: flex;
    margin: 20px 0;
    align-items: center;
  }
  
  .timeline-marker {
    font-size: 24px;
    margin-right: 15px;
    min-width: 40px;
  }
  
  .timeline-content {
    flex: 1;
  }
  
  .timeline-content strong {
    color: #2c3e50;
    display: block;
    margin-bottom: 5px;
  }
  
  .footer {
    background-color: #f8f9fa;
    padding: 25px 30px;
    text-align: center;
    border-top: 1px solid #e9ecef;
  }
  
  .footer p {
    margin: 8px 0;
    color: #6c757d;
  }
  
  .disclaimer {
    font-size: 12px;
    font-style: italic;
    opacity: 0.8;
  }
  
  /* Responsive Design */
  @media only screen and (max-width: 600px) {
    .container {
      margin: 10px;
      border-radius: 8px;
    }
    
    .header {
      padding: 30px 20px;
    }
    
    .header h1 {
      font-size: 24px;
    }
    
    .content, .footer {
      padding: 20px;
    }
    
    .data-row {
      flex-direction: column;
      align-items: flex-start;
    }
    
    .label {
      min-width: auto;
      margin-bottom: 5px;
    }
  }
`;

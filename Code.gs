function createMenu() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Publish to S3')
  .addItem('Update...', 'showConfig')
  .addToUi();
}

function onInstall() { 
  createMenu();
}

function onOpen() { 
  createMenu();
}

// publish updated JSON on active sheet to S3
// event object passed if called from trigger
function publish(event) {
  // do nothing if required configuration settings are not present
  if (!hasRequiredProps()) {
    return;
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  // get cell values from the range that contains data (2D array)
  var rows = spreadsheet
  .getDataRange()
  .getValues();

  // filter out empty rows
  rows = rows.filter(function(row){
    return row
    .some(function(value){
      return typeof value !== 'string' || value.length;
    });
  })
  // filter out columns that don't have a header (i.e. text in row 1)
  .map(function(row){
    return row
    .filter(function(value, index){
      return rows[0][index].length;
    });
  });

  // create an array of objects keyed by header
  var objs = rows
  .slice(1)
  .map(function(row){
    var obj = {};
    row.forEach(function(value, index){
      var prop = rows[0][index];
      // represent blank cell values as `null`
      // blank cells always appear as an empty string regardless of the data
      // type of other values in the column. neutralizing everything to `null`
      // lets us avoid mixing empty strings with other data types for a prop.
      obj[prop] = (typeof value === 'string' && !value.length) ? null : value;
    });
    return obj;
  });

  // upload to S3
  // https://engetc.com/projects/amazon-s3-api-binding-for-google-apps-script/
  var props = PropertiesService.getDocumentProperties().getProperties();
  var s3 = S3.getInstance(props.awsAccessKeyId, props.awsSecretKey);
  var filename = [spreadsheet.getName().replace(' ','_'), spreadsheet.getActiveSheet().getName().replace(' ','_')].join('_');
  s3.putObject(props.bucketName, [props.path, filename].join('/'), objs);
}

// show the configuration modal dialog UI
function showConfig() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getDocumentProperties().getProperties();
  var template = HtmlService.createTemplateFromFile('config');
  template.sheetId = sheet.getId();
  template.bucketName = props.bucketName || '';
  template.path = props.path || '';
  template.awsAccessKeyId = props.awsAccessKeyId || '';
  template.awsSecretKey = props.awsSecretKey || '';
  ui.showModalDialog(template.evaluate(), 'Amazon S3 publish configuration');
}

// update document configuration with values from form UI
function updateConfig(form) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getDocumentProperties().setProperties({
    bucketName: form.bucketName,
    path: form.path,
    awsAccessKeyId: form.awsAccessKeyId,
    awsSecretKey: form.awsSecretKey
  });
  var message;
  var filename = [sheet.getName().replace(' ','_'), sheet.getActiveSheet().getName().replace(' ','_')].join('_');
  if (hasRequiredProps()) {
    message = 'Published spreadsheet will be accessible at: \nhttps://' + form.bucketName + '.s3.amazonaws.com/' + form.path + '/' + filename;
    publish();
  }
  else {
    message = 'You will need to fill out all configuration options for your spreadsheet to be published to S3.';
  }
  var ui = SpreadsheetApp.getUi();
  ui.alert('✓ Configuration updated', message, ui.ButtonSet.OK);
}

// checks if document has the required configuration settings to publish to S3
// does not check if the config is valid
function hasRequiredProps() {
  var props = PropertiesService.getDocumentProperties().getProperties();
  return props.bucketName && props.awsAccessKeyId && props.awsSecretKey;
}

var fs = require('fs');

// fonts.css.network
// fonts.lug.ustc.edu.cn

function replace_google_fonts(path) {
  var data = fs.readFileSync(path).toString();
  if(data.indexOf('fonts.googleapis.com') > -1) {
    data = data.replace(/(https?:)?\/\/fonts\.googleapis\.com/g, 'http://fonts.lug.ustc.edu.cn');
    fs.writeFileSync(path, data);
  }
}

replace_google_fonts('app/assets/vendor/semantic/dist/semantic.css');
replace_google_fonts('app/assets/vendor/semantic/dist/semantic.min.css');

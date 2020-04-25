# ytBackGammon

## Javascript

[Backgammon board (Javascript version)](https://ytani01.github.io/ytBackgammon/)

## Memo

### Flask + Webscoket

* [Flask-Socket-IO](https://github.com/miguelgrinberg/Flask-SocketIO)
  - [Flask-SocketIOでWebSocketアプリケーション](https://qiita.com/nanakenashi/items/6497caf1c56c36f47be9)
  
### install browserMqtt.js

```
### make package.json
$ mkdir work
$ cd work
$ npm init -y
### install mqtt
$ npm install mqtt -save
### install browserify
$ (sudo) npm install -g browserify
### make browserMqtt.js
$ cd node_modules/mqtt
$ npm install .
$ browserify mqtt.js -s mqtt > browserMqtt.js
$ cp browserMqtt.js ${jsdir}
```

## References

* [GNU Backgammon](https://www.gnu.org/software/gnubg/)
* [GNU Backgammon Manual  V0.16](https://www.gnu.org/software/gnubg/manual/html_node/)
* [11 Technical Notes](https://www.gnu.org/software/gnubg/manual/html_node/Technical-Notes.html#Technical-Notes)
* [11.3 Python scripting](https://www.gnu.org/software/gnubg/manual/html_node/Python-scripting.html#Python-scripting)
* [いらすとや(フリー素材)](https://www.irasutoya.com/2019/05/blog-post_951.html)

### MQTT.js

* [MQTT.js](https://github.com/mqttjs/MQTT.js)
  - [Browserify](https://github.com/mqttjs/MQTT.js#browserify)

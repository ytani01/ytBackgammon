# ytBackGammon

## 実装

* [ネットワーク共有型バックギャモンボード: テストサイト](http://www.ytani.net:8080/ytbackgammon/)
  
  詳しくはこちら：[source](app/)

* [単なるバックギャモンボード](https://ytani01.github.io/ytBackgammon/)


## Memo

### install browserMqtt.js

`結局、使ってません`

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

### MQTT.js

* [MQTT.js](https://github.com/mqttjs/MQTT.js)
  - [Browserify](https://github.com/mqttjs/MQTT.js#browserify)

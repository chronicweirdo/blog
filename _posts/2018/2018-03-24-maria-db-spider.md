---
title: 'Partitioning SQL databases with MariaDB Spider'
date: 2018-03-24 165:00:00 EET
tags: ['sql', 'mariadb', 'sharding']
---

This quick post will walk you through the steps of setting up multiple MariaDB servers on your local machine and enabling data sharding with Spider.

## Running mulitple instances of MariaDB

Simple to do:

- download and install the MariaDB server, but don't install the service
- inside the MariaDB folder you will have a `data` subfolder; copy this `data` subfolder somewhere on the machine (for windows, copy it directly on `c:`, not in `Program Files`, so you don't have to worry about configuring permissions); do this twice, so you end up with `data2` and `data3`
- nex, run the following commands from separate command line / terminal windows to get 3 instances running on different ports on localhost:

```
mysqld --port=3306
```

```
mysqld --port=3307 --datadir="C:\data2" --console
```

```
mysqld --port=3308 --datadir="C:\data3" --console
```

## Configure Spider

We'll consider the instance running on port `3306` `local1`, the one running on `3307` `local2`, and the one running on `3308` `local3`. For our exercise, `local1` will be the master server, the one our app will interact with. `local1` will use `local2` and `local3` to store its data. The sharding will be handled by the Spider engine, but queries executed on `local1` should work as if we are interacting with a simple SQL database server.

First thing you need to do is to install Spider on the main server, `local1`. For this, you need to load up and run the `install_spider.sql` script from the MariaDB folder. You only need to run this script on the main server.

Next, we need to create the datbase structure on our two secondary servers `local2` and `local3` (example database structure is taken from the Spider Storage Engine documentation listed under sources at the end of the post).

``` sql
CREATE DATABASE backend;
CREATE TABLE backend.sbtest (
  id int(10) unsigned NOT NULL AUTO_INCREMENT,
  k int(10) unsigned NOT NULL DEFAULT '0',
  c char(120) NOT NULL DEFAULT '',
  pad char(60) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY k (k)
) ENGINE=InnoDB;
```

The next step is to create the same table structure in our main database server `local1`.

``` sql
CREATE SERVER backend1 
  FOREIGN DATA WRAPPER mysql 
OPTIONS( 
  HOST '127.0.0.1', 
  DATABASE 'backend',
  USER 'root',
  PASSWORD 'admin',
  PORT 3307
);
CREATE SERVER backend2 
  FOREIGN DATA WRAPPER mysql 
OPTIONS( 
  HOST '127.0.0.1', 
  DATABASE 'backend',
  USER 'root',
  PASSWORD 'admin',
  PORT 3308
);
CREATE DATABASE IF NOT EXISTS backend;
CREATE  TABLE backend.sbtest
(
  id int(10) unsigned NOT NULL AUTO_INCREMENT,
  k int(10) unsigned NOT NULL DEFAULT '0',
  c char(120) NOT NULL DEFAULT '',
  pad char(60) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY k (k)
) ENGINE=spider COMMENT='wrapper "mysql", table "sbtest"'
 PARTITION BY KEY (id) 
(
 PARTITION pt1 COMMENT = 'srv "backend1"',
 PARTITION pt2 COMMENT = 'srv "backend2"' 
);
```

As you can see, the first thing we do is add information about how `local1` can reach the slave servers (`backend1` corresponds to `local2` and `backend2` corresponds to `local3`). Next, when defining our table on `local1` we use `spider` as the engine and provide information on how the data should be partitioned between the two backend servers. This should complete our setup. Similar work will need to be done for every table in your database that you want to use sharding for.

## Testing the setup

Now insert some values in the table on your main server `local1`.

``` sql
insert into backend.sbtest (k, c, pad) values (1, 'first record', 'padding1')
insert into backend.sbtest (k, c, pad) values (2, 'second record', 'padding2')
insert into backend.sbtest (k, c, pad) values (3, 'third record', 'padding3')
```

When you query your main server table, all values should be returned.

``` sql
select * from backend.sbtest
```

However, this data does not reside on `local1` but is fetched from the backend servers. If you re-run the select query on your secondary servers, `local2` and `local3`, you should see that the inserted data has been split between the two instances.

## Sources

- [Spider Documentation](https://mariadb.com/kb/en/library/spider/)